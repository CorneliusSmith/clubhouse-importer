// const ch = require('clubhouse-lib');
import Clubhouse, { Epic, File, ID, LinkedFile } from 'clubhouse-lib';
import * as dotenv from 'dotenv';
import {
  ResourceMap,
  ResourceMaps,
  StoryForUpload,
  StoryLinkMap,
  StoryLinkResponse,
} from './types';
import {
  _getMapObj,
  _resolve,
  _cleanObj,
  mapStoryToStoryChange,
} from './utils';
dotenv.config();

// API Clients per workspace
const sourceApi = Clubhouse.create(
  process.env.CLUBHOUSE_API_TOKEN_SOURCE || ''
);
const targetApi = Clubhouse.create(
  process.env.CLUBHOUSE_API_TOKEN_TARGET || ''
);

export const defaultSettings = {
  // TODO: move to args
  SOURCE_PROJECT_ID: 12584,
  TARGET_PROJECT_ID: 12683,
  TARGET_EPIC_ID: 14924,
};

// // Used to update story names that have been migrated from the source workspace
// // and identify stories that have previously been migrated.
const migratedPrefix = '[Migrated:';

const addStoryLinks = async (settings: any) => {
  const sourceProjectId = settings
    ? settings.source_project
    : defaultSettings.SOURCE_PROJECT_ID;

  // Handle mapping for story links (x blocks y, etc)
  // This should run AFTER stories have been migrated.
  const storiesMap: StoryLinkMap = {};
  const allStoryLinks: StoryLinkResponse[] = [];
  await sourceApi.listStories(sourceProjectId).then((stories) => {
    stories.forEach((s) => {
      s.story_links.forEach((link) => {
        allStoryLinks.push({
          archived: s.archived,
          story_to_fix: s.id,
          old_subject_id: link.subject_id,
          verb: link.verb,
          old_object_id: link.object_id,
          created_at: link.created_at,
          updated_at: link.updated_at,
        });
      });
      // parse out the new id from the old story name, add to the map.
      const newID = s.name.split(migratedPrefix).pop();
      if (newID) {
        const finalID = newID.split(']')[0];
        storiesMap[s.id] = finalID;
      }
    });
    return stories;
  });

  console.log(
    `Creating missing story links for ${allStoryLinks.length} stories`
  );
  for (const link of allStoryLinks) {
    const linkParam = {
      object_id: storiesMap[link.old_object_id],
      subject_id: storiesMap[link.old_subject_id],
      verb: link.verb,
    };
    console.log(linkParam.subject_id, linkParam.verb, linkParam.object_id);
    try {
      await targetApi.createStoryLink(linkParam).then(console.log);
    } catch (err) {
      // Likely already imported.
      console.log(err);
    }
  }
};

const createIterationsFromSource = async () => {
  const existingTargetIters = await targetApi.listIterations().then((iters) => {
    return iters.map((iter) => iter.name);
  });

  await sourceApi.listIterations().then((iters) => {
    iters.map(async (iter) => {
      if (!existingTargetIters.includes(iter.name)) {
        const importIter = {
          name: iter.name,
          start_date: iter.start_date,
          end_date: iter.end_date,
        };
        await targetApi.createIteration(importIter).then(console.log);
      }
    });
  });
};

const importOne = async (settings: any) => {
  const storyId = settings.story;
  const targetProjectId =
    settings.target_project || defaultSettings.TARGET_PROJECT_ID;
  const targetEpicId = settings.target_epic || defaultSettings.TARGET_EPIC_ID;

  const resourceMaps = await getResourceMaps();
  const newStory = await getStoryForImport(
    storyId,
    resourceMaps,
    targetProjectId,
    targetEpicId
  );
  if (newStory.create.files) {
    const linked_file_ids = await uploadFiles(
      newStory.create.files,
      resourceMaps.members
    );
    for (const linked_file_id in linked_file_ids) {
      if (linked_file_id) {
        newStory.create.linked_file_ids.push(linked_file_ids[linked_file_id]);
      }
    }
  }

  newStory.create = mapStoryToStoryChange(
    newStory.create,
    newStory.create.linked_file_ids
  );
  await updateStory(newStory);
};

const importAll = async (settings: any) => {
  const sourceProjectId =
    settings.source_project || defaultSettings.SOURCE_PROJECT_ID;
  const targetProjectId =
    settings.target_project || defaultSettings.TARGET_PROJECT_ID;
  const targetEpicId = settings.target_epic || defaultSettings.TARGET_EPIC_ID;

  await sourceApi.listProjects().then((projs) => {
    projs.forEach((p) => console.log(p.name));
  });

  const sourceStoryIds = await sourceApi
    .listStories(sourceProjectId)
    .then((stories) => {
      return stories.map((s) => s.id);
    });
  console.log(sourceStoryIds);

  const resourceMaps = await getResourceMaps();

  const toImport = [];
  for (const storyId of sourceStoryIds) {
    const newStory = await getStoryForImport(
      storyId,
      resourceMaps,
      targetProjectId,
      targetEpicId
    );
    toImport.push(newStory);
  }
  //toImport = toImport.slice(0, 10)
  console.log(toImport.length);

  for (const newStory of toImport) {
    await updateStory(newStory);
  }
};

async function updateStory(newStory: StoryForUpload) {
  if (
    newStory.create.name &&
    !newStory.create.name.startsWith(migratedPrefix)
  ) {
    console.log('Want To Create:', newStory.create.name);
    await targetApi.createStory(newStory.create).then(async (res) => {
      console.log(`Created new story #${res.id}: ${res.name}`);
      console.log(` - - via old source story #${newStory.id}`);
      // const origDescription = newStory.create.description || '';
      // const updateSource = {
      //   name: `${migratedPrefix}${res.id}] ${newStory.create.name}`,
      //   description: `${origDescription}\n\n** Migrated to ${res.app_url} **`,
      // };

      // await sourceApi.updateStory(newStory.id, updateSource).then(console.log);
    });
  } else {
    console.log(
      `....We have already migrated this story... ~ ${newStory.create.name}`
    );
  }
}

const getStoryForImport = async (
  storyId: number,
  resourceMaps: ResourceMaps,
  projectId: ID,
  epicId: ID
) => {
  const members = resourceMaps.members;
  const iterations = resourceMaps.iterations;
  const workflows = resourceMaps.workflows;

  const s = await sourceApi.getStory(storyId).then((sty) => {
    console.log(`Fetched source story #${sty.id} - ${sty.name}`);
    return sty;
  });

  const linked_file_ids = await uploadFiles(s.linked_files, members);

  const sourceComments = s.comments.map((c) => {
    return {
      author_id: c.author_id ? members[c.author_id] : undefined,
      created_at: c.created_at,
      updated_at: c.updated_at,
      text: c.text,
    };
  });
  const sourceTasks = s.tasks.map((t) => {
    return {
      // a task is "complete" not "completed" like stories.
      complete: t.complete,
      owner_ids: mapMembers(t.owner_ids, members),
      created_at: t.created_at,
      updated_at: t.updated_at,
      description: t.description,
    };
  });
  const newStory = {
    archived: s.archived,
    comments: sourceComments,
    completed_at_override: s.completed_at_override,
    created_at: s.created_at,
    deadline: s.deadline,
    description: s.description,
    epic_id: epicId,
    estimate: s.estimate,
    external_id: s.app_url,
    external_links: s.external_links,
    follower_ids: mapMembers(s.follower_ids, members),
    iteration_id: s.iteration_id ? iterations[s.iteration_id] : undefined,
    name: s.name,
    labels: s.labels.map((label) => {
      return {
        name: label.name,
      };
    }),
    files: s.files, //This causes error. Get fileId before create stoy, set this to be empty and then after story is created in target api call get file and update the target story to upload the file
    linked_file_ids,
    owner_ids: mapMembers(s.owner_ids, members),
    project_id: projectId,
    requested_by_id: members[s.requested_by_id],
    started_at_override: s.started_at_override,
    story_type: s.story_type,
    tasks: sourceTasks,
    updated_at: s.updated_at,
    // workflow_state_id: 500000956,
  };

  return {
    id: s.id,
    create: _cleanObj(newStory),
  };
};

const mapMembers = (oldMemberIds: ID[], membersMap: ResourceMap) => {
  const memberIds: ID[] = [];
  oldMemberIds.forEach((o_id) => {
    const newId = membersMap[o_id];
    if (newId) {
      memberIds.push(newId);
    }
  });
  return memberIds;
};

/* Create objects mapping old workspace ids to new workspace ids for
   member, iterataion, and workflow resources
   TODO: do this for epics too.
*/
const getResourceMaps = async (): Promise<ResourceMaps> => {
  const membersMap = await _getMapObj(
    sourceApi,
    targetApi,
    'listMembers',
    'profile.email_address'
  );
  const itersMap = await _getMapObj(
    sourceApi,
    targetApi,
    'listIterations',
    'name'
  );
  const wfMap = await _getMapObj(
    sourceApi,
    targetApi,
    'listWorkflows',
    'name',
    'states'
  );
  console.log({
    members: membersMap,
    iterations: itersMap,
    workflows: wfMap,
  });
  return {
    members: membersMap,
    iterations: itersMap,
    workflows: wfMap,
  };
};

const importEpic = async (sourceEpicId: ID) => {
  const resourceMaps = await getResourceMaps();

  await sourceApi.getEpic(sourceEpicId).then(async (epic) => {
    //create labels
    const labelsToAdd = epic.labels.map((label) => ({
      name: label.name,
    }));

    //get necessary id fields
    const idMap = await _getMapObj(
      sourceApi,
      targetApi,
      'listMembers',
      'profile.email_address'
    );
    const owner_ids = epic.owner_ids.map((id) => idMap[id]);
    const follower_ids = epic.follower_ids.map((id) => idMap[id]);
    const requested_by_id = idMap[epic.requested_by_id];

    const importEpic = {
      created_at: epic.created_at,
      deadline: epic.deadline,
      description: epic.description,
      follower_ids,
      group_id: epic.group_id,
      labels: labelsToAdd,
      name: epic.name,
      owner_ids,
      planned_start_date: epic.planned_start_date,
      requested_by_id,
      state: epic.state,
      updated_at: epic.updated_at,
    };
    await targetApi.createEpic(importEpic).then(async (epic) => {
      createEpicStories(sourceEpicId, epic.id, resourceMaps);
    }); //silverorange is source, test is target
  });
};

const importAllEpics = async (projectId: number) => {
  //TODO: filter out epics with emrap labels
  const epicIds = await sourceApi.listEpics().then(async (epics) => {
    const reducedEpics = epics.reduce((res: Epic[], epic) => {
      if (epic.project_ids.includes(projectId)) {
        res.push(epic);
      }
      return res;
    }, []);
    return reducedEpics.map((e) => e.id);
  });
  epicIds.forEach((epicId) => importEpic(epicId));
  return 'Done Importing Epics';
};

const createEpicStories = async (
  sourceEpicId: ID,
  targetEpicId: ID,
  resourceMaps: ResourceMaps
) => {
  const targetProjectId = defaultSettings.TARGET_PROJECT_ID;

  await sourceApi.getEpic(sourceEpicId).then(async (epic) => {
    const epicStoryIds = await sourceApi
      .listEpicStories(epic.id)
      .then(async (stories) => {
        return stories.map((s) => s.id);
      });
    epicStoryIds.forEach(async (story) => {
      const fetchedStory = await getStoryForImport(
        story,
        resourceMaps,
        targetProjectId,
        targetEpicId
      );
      fetchedStory.create = mapStoryToStoryChange(
        fetchedStory.create,
        fetchedStory.create.linked_file_ids
      );
      updateStory(fetchedStory);
    });
  });
};

const createMilestone = async (milestoneId: ID) => {
  await sourceApi.getMilestone(milestoneId).then(async (milestone) => {
    const importMilestone = _cleanObj({
      name: milestone.name,
      categories: milestone.categories,
      started_at_override: milestone.started_at_override,
      completed_at_override: milestone.completed_at_override,
      state: milestone.state,
    });
    await targetApi
      .createMilestone(importMilestone)
      .then((milestone) => console.log(`Created Milestone ${milestone.name}`));
  });
};

const importAllLabels = async () => {
  // toImport = [];
  const existingLabels = await targetApi.listLabels().then((labels) => {
    return labels.map((label) => label.name.toLowerCase());
  });
  await sourceApi.listLabels().then(async (labels) => {
    labels.map(async (label) => {
      //Adds only labels that havent been prevoiusly migrated to the target workspace
      if (!existingLabels.includes(label.name.toLowerCase())) {
        await targetApi.createLabel(
          label.name,
          label.color ? label.color : 'black' //default to black color if no color exists
        );
      }
    });
  });
};

async function uploadFiles(files: File[] | LinkedFile[], members: ResourceMap) {
  const fileIDs = [];
  for (const file in files) {
    if (file) {
      const fileForUpload = files[file];
      const uploadFile = await targetApi.createLinkedFile({
        name: fileForUpload.name,
        type: 'url',
        description: fileForUpload.description || '',
        content_type: fileForUpload.content_type || '',
        url: fileForUpload.url || '',
        uploader_id: members[fileForUpload.uploader_id],
      });
      fileIDs.push(uploadFile.id);
    }
  }
  return fileIDs;
}

// module.exports = {
//   importAll,
//   importOne,
//   linkStories: addStoryLinks,
//   addIterations: createIterationsFromSource,
//   importAllEpics,
//   importEpic,
//   createMilestone,
//   importAllLabels,
// };

// require('make-runnable/custom')({
//   printOutputFrame: false,
// });
importEpic(8309);

import Clubhouse, { Epic, File, ID, LinkedFile } from 'clubhouse-lib';
import { RateLimiter } from 'limiter';

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
  getResourceMaps,
  mapMembers,
  mapEpicToEpicChange,
} from './utils';

dotenv.config();

const limiter = new RateLimiter({ tokensPerInterval: 200, interval: 'minute' });

// API Clients per workspace
const sourceApi = Clubhouse.create(
  process.env.CLUBHOUSE_API_TOKEN_SOURCE || ''
);
const targetApi = Clubhouse.create(
  process.env.CLUBHOUSE_API_TOKEN_SILVER_ORANGE_AND_SMALLS || ''
);

export const defaultSettings = {
  // TODO: move to args
  SOURCE_PROJECT_ID: process.env.CLUBHOUSE_SOURCE_PROJECT || '',
  TARGET_PROJECT_ID: process.env.CLUBHOUSE_TARGET_PROJECT || '',
  TARGET_EPIC_ID: 'input epic id',
};

// // Used to update story names that have been migrated from the source workspace
// // and identify stories that have previously been migrated.
const migratedPrefix = '[Migrated:';

export async function addStoryLinks(settings: any) {
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
}

export async function createIterationsFromSource() {
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
}

export async function importOne(settings: any) {
  const storyId = settings.story;
  const targetProjectId =
    settings.target_project || defaultSettings.TARGET_PROJECT_ID;
  const targetEpicId = settings.target_epic || defaultSettings.TARGET_EPIC_ID;

  const resourceMaps = await getResourceMaps(sourceApi, targetApi);
  const newStory = await getStoryForImport(
    storyId,
    resourceMaps,
    targetProjectId,
    targetEpicId
  );

  if (newStory.create.files) {
    newStory.create = await convertFilesToLinkedFiles(newStory, resourceMaps);
  }

  newStory.create = mapStoryToStoryChange(
    newStory.create,
    newStory.create.linked_file_ids
  );
  await updateStory(newStory);
}

export async function importAll(settings: any) {
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

  const resourceMaps = await getResourceMaps(sourceApi, targetApi);

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

  for (const newStory of toImport) {
    await updateStory(newStory);
  }
}

export async function updateStory(newStory: StoryForUpload) {
  if (newStory.create.name && !newStory.create.name.includes(migratedPrefix)) {
    console.log('Want To Create:', newStory.create.name);
    const remainingRequests = await limiter.removeTokens(1);
    if (remainingRequests <= 1) {
      console.log(`RATE LIMIT REACHED PLEASE WAIT`);
    }
    await targetApi.createStory(newStory.create).then(async (res) => {
      console.log(`Created new story #${res.id}: ${res.name}`);
      console.log(` - - via old source story #${newStory.id}`);
      let origDescription = newStory.create.description?.split('\n') || [];
      origDescription =
        origDescription !== []
          ? origDescription.slice(1, origDescription.length)
          : [];
      const updateSource = {
        name: `${migratedPrefix}${res.id}] ${newStory.create.name}`,
        description: `${origDescription.join('\n')}\n\n** Migrated To: ${
          res.app_url
        } **`,
      };
      const remainingRequests = await limiter.removeTokens(1);
      if (remainingRequests <= 1) {
        console.log(`RATE LIMIT REACHED PLEASE WAIT`);
      }
      await sourceApi.updateStory(newStory.id, updateSource);
    });
  } else {
    console.log(
      `....We have already migrated this story... ~ ${newStory.create.name}`
    );
  }
}

export async function getStoryForImport(
  storyId: number,
  resourceMaps: ResourceMaps,
  projectId: ID,
  epicId: ID
) {
  const members = resourceMaps.members;
  const iterations = resourceMaps.iterations;
  const workflows = resourceMaps.workflows;

  const s = await sourceApi.getStory(storyId).then((sty) => {
    console.log(`Fetched source story #${sty.id} - ${sty.name}`);
    return sty;
  });

  const linked_file_ids = await uploadFiles(s.linked_files, members);
  const description = `** Migrated From: ${s.app_url} **\n\n${s.description}`;
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
    description: description,
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
}

export async function importEpic(sourceEpicID: ID) {
  const resourceMaps = await getResourceMaps(sourceApi, targetApi);
  await sourceApi.getEpic(sourceEpicID).then(async (epic) => {
    //get necessary id fields
    const idMap = await _getMapObj(
      sourceApi,
      targetApi,
      'listMembers',
      'profile.email_address'
    );

    const importEpic = await mapEpicToEpicChange(
      sourceApi,
      targetApi,
      epic,
      idMap
    );
    const remainingRequests = await limiter.removeTokens(1);
    if (remainingRequests <= 1) {
      console.log(`RATE LIMIT REACHED PLEASE WAIT`);
    }
    await targetApi.createEpic(importEpic).then(async (epic) => {
      await Promise.all([
        importEpicComments({ sourceEpicID, targetEpicID: epic.id }),
        createEpicStories(sourceEpicID, epic.id, resourceMaps),
      ]);
    }); //silverorange is source, test is target
  });
}

export async function importAllEpics() {
  //TODO: filter out epics with emrap labels
  console.log(targetApi);
  const epicIds = await sourceApi.listEpics().then(async (epics) => {
    const reducedEpics = epics.reduce((res: Epic[], epic) => {
      for (const label in epic.labels) {
        if (epic.labels[label].name === 'moved to coursehost WS') {
          res.push(epic);
        }
      }
      return res;
    }, []);
    return reducedEpics.map((e) => e.id);
  });
  console.log(epicIds);
  epicIds.forEach((epicId) => importEpic(epicId));
  return 'Done Importing Epics';
}

export async function createEpicStories(
  sourceEpicId: ID,
  targetEpicId: ID,
  resourceMaps: ResourceMaps
) {
  const targetProjectId = defaultSettings.TARGET_PROJECT_ID;

  const remainingRequests = await limiter.removeTokens(1);
  if (remainingRequests <= 1) {
    console.log(`RATE LIMIT REACHED PLEASE WAIT`);
  }
  await sourceApi.getEpic(sourceEpicId).then(async (epic) => {
    const epicStoryIds = await sourceApi
      .listEpicStories(epic.id)
      .then(async (stories) => {
        return stories.map((s) => s.id);
      });
    epicStoryIds.forEach(async (story) => {
      const remainingRequests = await limiter.removeTokens(1);
      if (remainingRequests <= 1) {
        console.log(`RATE LIMIT REACHED PLEASE WAIT`);
      }
      const fetchedStory = await getStoryForImport(
        story,
        resourceMaps,
        targetProjectId,
        targetEpicId
      );

      if (fetchedStory.create.files) {
        fetchedStory.create = await convertFilesToLinkedFiles(
          fetchedStory,
          resourceMaps
        );
      }

      fetchedStory.create = mapStoryToStoryChange(
        fetchedStory.create,
        fetchedStory.create.linked_file_ids
      );
      await updateStory(fetchedStory);
    });
  });
}

export async function createMilestone(milestoneId: ID) {
  return await sourceApi.getMilestone(milestoneId).then(async (milestone) => {
    const importMilestone = _cleanObj({
      name: milestone.name,
      categories: milestone.categories.map((category) => {
        return {
          name: category.name,
        };
      }),
      started_at_override: milestone.started_at_override,
      completed_at_override: milestone.completed_at_override,
      state: milestone.state,
    });
    const res = await targetApi
      .createMilestone(importMilestone)
      .then((milestone) => {
        console.log(`Created Milestone ${milestone.name}`);
        return milestone;
      });
    return res;
  });
}

export async function importMilestone(milestoneID: ID) {
  const resourceMaps = await getResourceMaps(sourceApi, targetApi);
  const idMap = await _getMapObj(
    sourceApi,
    targetApi,
    'listMembers',
    'profile.email_address'
  );
  const epics = await sourceApi.listMilestoneEpics(milestoneID);

  createMilestone(milestoneID).then(async (milestone) => {
    for (const epic in epics) {
      const importEpic = await mapEpicToEpicChange(
        sourceApi,
        targetApi,
        epics[epic],
        idMap,
        milestone.id
      );
      await targetApi.createEpic(importEpic).then(async (epicResult) => {
        await Promise.all([
          importEpicComments({
            sourceEpicID: epics[epic].id,
            targetEpicID: epicResult.id,
          }),
          createEpicStories(epics[epic].id, epicResult.id, resourceMaps),
        ]);
      });
    }
  });
}

export async function importAllLabels() {
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
          label.color ? label.color : '#000000' //default to black color if no color exists
        );
      }
    });
  });
}

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

async function convertFilesToLinkedFiles(
  story: any,
  resourceMaps: ResourceMaps
) {
  const remainingRequests = await limiter.removeTokens(1);
  if (remainingRequests <= 1) {
    console.log(`RATE LIMIT REACHED PLEASE WAIT`);
  }
  const linked_file_ids = await uploadFiles(
    story.create.files,
    resourceMaps.members
  );

  for (const linked_file_id in linked_file_ids) {
    if (linked_file_id) {
      story.create.linked_file_ids.push(linked_file_ids[linked_file_id]);
    }
  }

  return story.create;
}

export async function importMissingEpicStories(settings: {
  sourceEpicID: ID;
  targetEpicID: ID;
}) {
  console.log(settings.sourceEpicID, settings.targetEpicID);
  const resourceMaps = await getResourceMaps(sourceApi, targetApi);
  createEpicStories(settings.sourceEpicID, settings.targetEpicID, resourceMaps);
}

export async function importEpicComments(settings: {
  sourceEpicID: ID;
  targetEpicID: ID;
}) {
  const resourceMaps = await getResourceMaps(sourceApi, targetApi);
  const membersMap = resourceMaps.members;
  const remainingRequests = await limiter.removeTokens(1);
  if (remainingRequests <= 1) {
    console.log(`RATE LIMIT REACHED PLEASE WAIT`);
  }
  const comments = await sourceApi.listEpicComments(settings.sourceEpicID);
  if (comments) {
    comments.map(async (c) => {
      const commentChange = {
        author_id: c.author_id ? membersMap[c.author_id] : null,
        created_at: c.created_at,
        updated_at: c.updated_at,
        text: c.text,
      };
      const remainingRequests = await limiter.removeTokens(1);
      if (remainingRequests <= 1) {
        console.log(`RATE LIMIT REACHED PLEASE WAIT`);
      }
      await targetApi.createEpicComment(settings.targetEpicID, commentChange);
    });
    return 'Done Importing Epic Comments';
  }
  return 'No Epic Comments To Import';
}

require('make-runnable/custom')({
  printOutputFrame: false,
});

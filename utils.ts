import Client, {
  Epic,
  ID,
  Iteration,
  Member,
  Story,
  Workflow,
} from 'clubhouse-lib';
import { ResourceMap, ResourceMaps } from './types';

/* Utility to do a deep resolution of a nested object key */
export function _resolve(path: string | string[], obj: any, separator = '.') {
  var properties = Array.isArray(path) ? path : path.split(separator);
  return properties.reduce((prev, curr) => prev && prev[curr], obj);
}

/* Utility to remove null and undefined values from an object */
export function _cleanObj(obj: any) {
  const propNames = Object.getOwnPropertyNames(obj);
  for (let i = 0; i < propNames.length; i++) {
    const propName = propNames[i];
    if (obj[propName] === null || obj[propName] === undefined) {
      delete obj[propName];
    }
  }
  return obj;
}

export async function _getMapObj(
  sourceApi: Client<RequestInfo, Response>,
  targetApi: Client<RequestInfo, Response>,
  apiCall: 'listMembers' | 'listIterations' | 'listWorkflows',
  keyField: string,
  innerArrayField?: 'states'
) {
  const sourceMapNameToId: ResourceMap = {};
  await sourceApi[apiCall]().then(
    (list: Member[] | Iteration[] | Workflow[]) => {
      list.forEach((i: Member | Iteration | Workflow) => {
        if (innerArrayField && i.hasOwnProperty(innerArrayField)) {
          (i as Workflow)[innerArrayField].forEach((inner) => {
            sourceMapNameToId[_resolve(keyField, inner)] = inner.id;
          });
        } else {
          sourceMapNameToId[_resolve(keyField, i)] = i.id;
        }
      });
    }
  );

  await sourceApi[apiCall]().then(
    (list: Member[] | Iteration[] | Workflow[]) => {
      list.forEach((i: Member | Iteration | Workflow) => {
        if (innerArrayField && i.hasOwnProperty(innerArrayField)) {
          (i as Workflow)[innerArrayField].forEach((inner) => {
            sourceMapNameToId[_resolve(keyField, inner)] = inner.id;
          });
        } else {
          sourceMapNameToId[_resolve(keyField, i)] = i.id;
        }
      });
    }
  );
  console.log(`...Temp map by ${keyField} for ${apiCall}`);
  // console.log(sourceMapNameToId);

  const mapSourceToTargetIds: ResourceMap = {};
  await targetApi[apiCall]().then(
    (list: Member[] | Iteration[] | Workflow[]) => {
      list.forEach((i: Member | Iteration | Workflow) => {
        if (innerArrayField && i.hasOwnProperty(innerArrayField)) {
          (i as Workflow)[innerArrayField].forEach((inner) => {
            const oldId = sourceMapNameToId[_resolve(keyField, inner)];
            if (oldId) {
              mapSourceToTargetIds[oldId] = inner.id;
            }
          });
        } else {
          const oldId = sourceMapNameToId[_resolve(keyField, i)];
          if (oldId) {
            mapSourceToTargetIds[oldId] = i.id;
          }
        }
      });
    }
  );
  return mapSourceToTargetIds;
}

export function mapStoryToStoryChange(story: any, linked_file_ids: ID[]) {
  const storyChange = {
    archived: story.archived,
    comments: story.comments,
    completed_at_override: story.completed_at_override,
    created_at: story.created_at,
    deadline: story.deadline,
    description: story.description,
    epic_id: story.epic_id,
    estimate: story.estimate,
    external_id: story.app_url,
    external_links: story.external_links,
    follower_ids: story.follower_ids,
    iteration_id: story.iteration_id,
    name: story.name,
    labels: story.labels,
    linked_file_ids,
    owner_ids: story.owner_ids,
    project_id: story.project_id,
    requested_by_id: story.requested_by_id,
    started_at_override: story.started_at_override,
    story_type: story.story_type,
    tasks: story.tasks,
    updated_at: story.updated_at,
  };
  return _cleanObj(storyChange);
}

export async function mapEpicToEpicChange(
  sourceApi: Client<RequestInfo, Response>,
  targetApi: Client<RequestInfo, Response>,
  epic: Epic,
  idMap: ResourceMap,
  milestoneID?: ID
) {
  //create labels
  const labelsToAdd = epic.labels.map((label) => ({
    name: label.name,
  }));

  const owner_ids = epic.owner_ids.map((id) => idMap[id]);
  const follower_ids = epic.follower_ids.map((id) => idMap[id]);
  const requested_by_id = idMap[epic.requested_by_id];

  const description = `** Migrated From:${epic.app_url} **\n\n${epic.description}`;

  const importEpic = _cleanObj({
    created_at: epic.created_at,
    completed_at_override: epic.completed_at,
    started_at_override: epic.started_at,
    deadline: epic.deadline,
    description,
    follower_ids,
    group_id: epic.group_id,
    labels: labelsToAdd,
    name: epic.name,
    owner_ids,
    planned_start_date: epic.planned_start_date,
    requested_by_id,
    state: epic.state,
    updated_at: epic.updated_at,
    ...(milestoneID !== undefined && {
      milestone_id: milestoneID,
    }),
  });
  return importEpic;
}

/* Create objects mapping old workspace ids to new workspace ids for
   member, iterataion, and workflow resources
*/
export async function getResourceMaps(
  sourceApi: Client<RequestInfo, Response>,
  targetApi: Client<RequestInfo, Response>
) {
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

  return {
    members: membersMap,
    iterations: itersMap,
    workflows: wfMap,
  };
}

export function mapMembers(oldMemberIds: ID[], membersMap: ResourceMap) {
  const memberIds: ID[] = [];
  oldMemberIds.forEach((o_id) => {
    const newId = membersMap[o_id];
    if (newId) {
      memberIds.push(newId);
    }
  });
  return memberIds;
}

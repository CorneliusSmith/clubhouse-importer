import Client, { ID, Iteration, Member, Story, Workflow } from 'clubhouse-lib';
import { ResourceMap } from './types';

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

import Client, { Iteration, Member, Workflow } from 'clubhouse-lib';
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

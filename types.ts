import { ID, Story, StoryChange, Task } from 'clubhouse-lib/lib/types';

export type ResourceMap = {
  [key: string]: ID;
};

export type ResourceMaps = {
  members: ResourceMap;
  iterations: ResourceMap;
  workflows: ResourceMap;
};

interface StoryUpload extends StoryChange {
  comments: Array<Comment>;
  external_links: Array<string>;
  tasks: Array<Task>;
}
export type StoryForUpload = {
  id: number;
  create: StoryUpload;
};

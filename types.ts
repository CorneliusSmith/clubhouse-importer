import { ID, StoryChange, StoryLinkVerb, Task } from 'clubhouse-lib/lib/types';

export type ResourceMap = {
  [key: string]: ID;
};

export type StoryLinkMap = {
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

export type StoryLinkResponse = {
  archived: boolean;
  story_to_fix: number;
  old_subject_id: ID;
  verb: StoryLinkVerb;
  old_object_id: ID;
  created_at: string;
  updated_at: string;
};

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

export type MilestoneStates = 'done' | 'in progress' | 'to do';

export type CategoryParams = {
  color: string;
  external_id: string;
  name: string;
};

export type MilestoneChange = {
  after_id: number;
  before_id: number;
  categories: Array<CategoryParams>;
  completed_at_override: Date | null;
  description: string;
  name: string;
  started_at_override: Date | null;
  state: MilestoneStates;
};

# clubhouse-importer

Migrate stories from one clubhouse.io workspace to a different workspace

Store your tokens, one for the source workspace and one for the target workspace in a `.env` file in the project directory.

```
CLUBHOUSE_API_TOKEN_SOURCE = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
CLUBHOUSE_API_TOKEN_TARGET = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
```

## Requirements

- Before running, duplicate all users referenced in stories from the source workspace into the new target workspace. You can use the Org Dashboard for this: https://app.clubhouse.io/organizations/<org-name>/manage

- Create a target project (you'll need the ID below) and a target epic in the new workspace.

## Usage

The importer runs via command line.

`cd` to the product directory and run ` yarn build`
Commads are run using `node index.js <func> <args>`

Some methods accept a "settings" object via `args` that should specify clubhouse.io entity _IDs_ for the source project, target project, and target epic.

**_If `yarn install` is ran ensure clubhouse-lib files are replaced with the files from the repo since missing api endpoints were added!_**

To migrate the iterations from the source workspace:

```
node index.js addIteration
```

To import a single story:

```
node index.js importOne --story <storyId> --target_project <projectId> --target_epic <epicId>
```

To import all stories from the source workspace for a source project id:

```
node index.js importAll --source_project <projectId> --target_project <projectId> --target_epic <epicId>
```

To add any story "links" (Story YY is blocked by Story ZZ) after an import is run:

```
node index.js linkStories --source_project <projectId>
```

To import all epics of a workspace and all its stories:

```
node index.js importAllEpics
```

To import single epics and all its stories from one workspace to another:

```
node index.js importEpics <epicId>
```

To import any epic stories missed if api request limit is reached during import:

```
node index.js importMissingEpicStories --sourceEpicID <epicId> --targetEpicID <epicId>
```

To import any epic comments. (This will be ran when importing all epics or single epic):

```
node index.js importEpicComments --sourceEpicID <epicId> --targetEpicID <epicId>
```

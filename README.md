# delete-deployment-environment

GitHub action that will find and delete all deployments by deployment name as well as the GitHub environment
they are deployed to.
It will first find and mark all deployments as `inactive` and then delete all deployments and then the environment.

If you want to only delete deployments and the not environment, add `onlyRemoveDeployments: true`.

If you want to keep deployments but inactivate all deployments, add `onlyDeactivateDeployments: true`

Note if you pass `onlyDeactivateDeployments: true` and `onlyRemoveDeployments: true`, `onlyRemoveDeployments` will override
`onlyDeactivateDeployments` and all deployments will be removed.

Also note that if you are planning on deleting a created environment, your `GITHUB_TOKEN` must have permissions with repo scope. The token provided by the workflow, `github.token` does not have the permissions to delete created environments. [delete environment](https://docs.github.com/en/rest/reference/repos#delete-an-environment)

## Inputs

| name                        | description                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `token`                     | GitHub token                                                                          |
| `environment`               | The Name of the environment to delete                                                 |
| `onlyRemoveDeployments`     | Delete deployments and not the environment. Default false                             |
| `onlyDeactivateDeployments` | Deactivate the deployments but don't remove deployments or environment. Default false |

## Usage

The example below will be triggered on a delete event

```yaml
name: Delete Environment (default settings)

on:
  delete:
    branches-ignore:
      - main

jobs:
  delete:
    runs-on: ubuntu-latest
    steps:
      - uses: strumwolf/delete-deployment-environment@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          environment: my-environment-name
```

```yaml
name: Delete Deployments

on:
  delete:
    branches-ignore:
      - main

jobs:
  delete:
    runs-on: ubuntu-latest
    steps:
      - uses: strumwolf/delete-deployment-environment@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          environment: my-environment-name
          onlyRemoveDeployments: true
```

```yaml
name: Set deployements to inactive

on:
  delete:
    branches-ignore:
      - main

jobs:
  delete:
    runs-on: ubuntu-latest
    steps:
      - uses: strumwolf/delete-deployment-environment@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          environment: my-environment-name
          onlyDeactivateDeployments: true
```

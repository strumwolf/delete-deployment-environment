# delete-deployment-environment

GitHub action that will find and delete all deployments by deployment name.
It will first find and mark all deployments as `inactive` and then delete all deployments.

## Inputs

| name          | description                           |
| ------------- | ------------------------------------- |
| `token`       | GitHub token                          |
| `environment` | The Name of the environment to delete |

## Usage

The example below will be triggered on a delete event

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
      - uses: strumwolf/delete-deployment-environment@v1.1.0
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          environment: my-environment-name
```

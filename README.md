# delete-deployment-environment

GitHub action that will find and delete all deployments by deployment name as well as the GitHub environment
they are deployed to.
It will first find and mark all deployments as `inactive` and then delete all deployments and then the environment.

If you want to only delete deployments and the not environment, add `onlyRemoveDeployments: true`.

If you want to keep deployments but inactivate all deployments, add `onlyDeactivateDeployments: true`

If you want to only delete a deployment ref and not all deployments of a given environment, add `ref: my-branch`

Note if you pass `onlyDeactivateDeployments: true` and `onlyRemoveDeployments: true`, `onlyRemoveDeployments` will override
`onlyDeactivateDeployments` and all deployments will be removed.

Also note that if you are planning on deleting a created environment, your `GITHUB_TOKEN` must have permissions with repo scope. The token provided by the workflow, `github.token` does not have the permissions to delete created environments. _(See [Delete an environment REST API docs](https://docs.github.com/en/rest/reference/repos#delete-an-environment))_

If you see a `Resource not accessible by integration` error, you'll likely need to follow the instructions below to obtain the proper token.

### How to obtain the proper token

For certain operations _(like deleting an environment)_, your GitHub Action will need additional permissions that your `github.token` simply doesn't have.

In this case, a [GitHub App](https://docs.github.com/en/developers/apps/getting-started-with-apps/about-apps) can be created to assume the required permissions, and ultimately your own Actions will use a [Private Key](https://docs.github.com/en/developers/apps/building-github-apps/authenticating-with-github-apps#generating-a-private-key) to later exchange for a JWT token, which this Action can use to execute operations.

1. [Create a GitHub app](https://docs.github.com/en/developers/apps/building-github-apps/creating-a-github-app).
2. [Generate a Private Key](https://docs.github.com/en/developers/apps/building-github-apps/authenticating-with-github-apps#generating-a-private-key)
3. Add your GitHub App's "App ID" to your repo's [Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets) _(ex: `GH_APP_ID`)_
4. Add your Private Key to your repo's [Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets) _(ex: `GH_APP_PRIVATE_KEY`)_
5. Use [navikt/github-app-token-generator](https://github.com/navikt/github-app-token-generator) before using this action to generate a JWT

   #### Example

   `cleanup-pr.yml`

   ```yml
   #
   # Cleans up a GitHub PR
   #
   name: 🧼 Clean up environment
   on:
   pull_request:
     types:
       - closed

   jobs:
     cleanup:
       runs-on: ubuntu-latest
       permissions: write-all

       steps:
         - uses: actions/checkout@v3

         # Points to a recent commit instead of `main` to avoid supply chain attacks. (The latest tag is very old.)
         - name: 🎟 Get GitHub App token
           uses: navikt/github-app-token-generator@a3831f44404199df32d8f39f7c0ad9bb8fa18b1c
           id: get-token
           with:
             app-id: ${{ secrets.GH_APP_ID }}
             private-key: ${{ secrets.GH_APP_PRIVATE_KEY }}

         - name: 🗑 Delete deployment environment
           uses: strumwolf/delete-deployment-environment@v2.2.3
           with:
             # Use a JWT created with your GitHub App's private key
             token: ${{ steps.get-token.outputs.token }}
             environment: pr-${{ github.event.number }}
             ref: ${{ github.ref_name }}
   ```

## Inputs

| name                        | description                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `token`                     | GitHub token like `${{ github.token }}` or `${{ secrets.GITHUB_TOKEN }}`                |
| `environment`               | The Name of the environment to delete                                                   |
| `onlyRemoveDeployments`     | Delete deployments and not the environment. Default `false`                             |
| `onlyDeactivateDeployments` | Deactivate the deployments but don't remove deployments or environment. Default `false` |
| `ref`                       | The name of the deployment ref to delete                                                |

## Usage

### Deactives and removes deployment environment (also from settings)

The example below will be triggered on a delete event.

- ✔️ Deactivates deployment
- ✔️ Removes from deployments tab
- ✔️ Removes from environment tab in settings

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
          # ⚠️ The provided token needs permission for admin write:org
          token: ${{ secrets.GITHUB_TOKEN }}
          environment: my-environment-name
```

### Deactivates and removes deployment environment

The example below will be triggered on a delete event.

- ✔️ Deactivates deployment
- ✔️ Removes from deployments tab
- ❌ Removes from environment tab in settings

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

### Deactivates and removes a deployment ref of a given environment

The example below will be triggered on a delete event.

- ✔️ Deactivates deployment
- ✔️ Removes from deployments tab
- ✔️ Removes only a deployment ref
- ❌ Removes from environment tab in settings

```yaml
name: Delete Deployments Ref

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
          ref: my-branch
          onlyRemoveDeployments: true
```

### Deactivates deployment environment

The example below will be triggered on a delete event.

- ✔️ Deactivates deployment
- ❌ Removes from deployments tab
- ❌ Removes from environment tab in settings

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

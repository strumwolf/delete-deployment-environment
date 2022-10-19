# Contributing Guide

You can directly make a pull request to the repository or fork the repository.

## Forking the Repository

Forking this repository may make things easier to test when you are running tests locally.

### Running Unit Tests

You will need to have a `release/v2` branch created in order for some of the unit tests to work.

> For any new changes, please create new unit tests (if applicable) that cover the functionality.

On forked repositories, you will need to generate a `Personal Access Token` and set the `GITHUB_TOKEN` environment variable. You can generate one [here](https://github.com/settings/tokens/new). Make sure you select the `repo` box to give the token permission full control of your repositories.

You will also need to set the `OWNER` environment variable to change the owner to yourself. The default will be the original repository owner `strumwolf`.

```sh
export GITHUB_TOKEN=<TOKEN>      # Your personal access token (PAT)
export OWNER=<OWNER>             # Your GitHub ID / Repository Owner
npm run test
```

You can run it in one line as well:

```sh
OWNER=<OWNER> GITHUB_TOKEN=<TOKEN> npm run test
```

## Pull Request

Once you have completed your changes, you can create a PR against the main branch of the repository and it will be reviewed and merged by a maintainer.

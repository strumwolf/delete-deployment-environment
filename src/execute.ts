import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/core';

interface ListDeploymentIDs {
  owner: string;
  repo: string;
  environment: string;
}

interface Deployment {
  owner: string;
  repo: string;
  deploymentId: number;
}

interface Context {
  owner: string;
  repo: string;
}

interface DeploymentRef extends Context {
  ref: string;
}

async function listDeploymentIds(
  client: Octokit,
  { owner, repo, environment }: ListDeploymentIDs,
): Promise<number[]> {
  const { data } = await client.request(
    'GET /repos/{owner}/{repo}/deployments',
    {
      owner,
      repo,
      environment,
    },
  );
  const deploymentIds: number[] = data.map((deployment) => deployment.id);
  return deploymentIds;
}

async function setDeploymentInactive(
  client: Octokit,
  { owner, repo, deploymentId }: Deployment,
): Promise<void> {
  await client.request(
    'POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses',
    {
      owner,
      repo,
      deployment_id: deploymentId,
      state: 'inactive',
    },
  );
}

async function deleteDeploymentById(
  client: Octokit,
  { owner, repo, deploymentId }: Deployment,
): Promise<void> {
  await client.request(
    'DELETE /repos/{owner}/{repo}/deployments/{deployment_id}',
    {
      owner,
      repo,
      deployment_id: deploymentId,
    },
  );
}

async function deleteDeploymentByRef(
  client: Octokit,
  { owner, repo, ref }: DeploymentRef,
): Promise<void> {
  await client.request('DELETE /repos/{owner}/{repo}/deployments?ref={ref}', {
    owner,
    repo,
    ref,
  });
}

async function deleteTheEnvironment(
  client: Octokit,
  environment: string,
  { owner, repo }: Context,
): Promise<void> {
  let existingEnv = false;
  try {
    const getEnvResult = await client.request(
      'GET /repos/{owner}/{repo}/environments/{environment_name}',
      {
        owner,
        repo,
        environment_name: environment,
      },
    );
    existingEnv = typeof getEnvResult === 'object';
  } catch (err) {
    if (err.status !== 404) {
      core.error('Error deleting environment');
      throw err;
    }
  }

  if (existingEnv) {
    core.info(`deleting environment ${environment}`);
    await client.request(
      'DELETE /repos/{owner}/{repo}/environments/{environment_name}',
      {
        owner,
        repo,
        environment_name: environment,
      },
    );
    core.info(`environment ${environment} deleted`);
  }
}

export async function main(): Promise<void> {
  let deleteDeployment = true;
  let deleteEnvironment = true;
  const { context } = github;
  const token: string = core.getInput('token', { required: true });
  const environment: string = core.getInput('environment', { required: true });
  const onlyRemoveDeployments: string = core.getInput('onlyRemoveDeployments', {
    required: false,
  });
  const onlyDeactivateDeployments: string = core.getInput(
    'onlyDeactivateDeployments',
    {
      required: false,
    },
  );
  const ref: string = core.getInput('ref', { required: false });
  const client: Octokit = github.getOctokit(token, { previews: ['ant-man'] });

  if (onlyDeactivateDeployments === 'true') {
    deleteDeployment = false;
    deleteEnvironment = false;
  } else if (onlyRemoveDeployments === 'true') {
    deleteEnvironment = false;
  }
  try {
    const deploymentIds = await listDeploymentIds(client, {
      ...context.repo,
      environment,
    });
    core.info(`Found ${deploymentIds.length} deployments`);
    core.info(`deactivating deployments in environment ${environment}`);
    await Promise.all(
      deploymentIds.map((deploymentId) =>
        setDeploymentInactive(client, { ...context.repo, deploymentId }),
      ),
    );

    if (deleteDeployment) {
      if (ref) {
        core.info(`deleting ref ${ref} from environment ${environment}`);
        await deleteDeploymentByRef(client, {
          ...context.repo,
          ref,
        });
      } else {
        core.info(`deleting deployments in environment ${environment}`);
        await Promise.all(
          deploymentIds.map((deploymentId) =>
            deleteDeploymentById(client, {
              ...context.repo,
              deploymentId,
            }),
          ),
        );
      }
    }

    if (deleteEnvironment) {
      await deleteTheEnvironment(client, environment, context.repo);
    }
    core.info('done');
  } catch (error) {
    core.setFailed(error.message);
  }
}

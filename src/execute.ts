import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/core';
import { RequestError } from '@octokit/request-error';

interface ListDeploymentIDs {
  owner: string;
  repo: string;
  environment: string;
  ref: string;
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

export interface DeploymentRef {
  deploymentId: number;
  ref: string;
}

async function listDeployments(
  client: Octokit,
  { owner, repo, environment, ref = '' }: ListDeploymentIDs,
  page = 0,
): Promise<DeploymentRef[]> {
  core.debug(`Getting list of deployments in environment ${environment}`);
  const { data } = await client.request(
    'GET /repos/{owner}/{repo}/deployments',
    {
      owner,
      repo,
      environment,
      ref,
      per_page: 100,
      page,
    },
  );
  const deploymentRefs: DeploymentRef[] = data.map((deployment) => ({
    deploymentId: deployment.id,
    ref: deployment.ref,
  }));
  core.debug(
    `Getting total of ${deploymentRefs.length} deployments on page ${page} `,
  );

  if (deploymentRefs.length === 100)
    return deploymentRefs.concat(
      await listDeployments(
        client,
        { owner, repo, environment, ref },
        page + 1,
      ),
    );

  return deploymentRefs;
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
    if ((err as RequestError).status !== 404) {
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
  core.debug(`Starting Deployment Deletion action`);
  const client: Octokit = github.getOctokit(token, {
    throttle: {
      onRateLimit: (retryAfter = 0, options: any) => {
        console.warn(
          `Request quota exhausted for request ${options.method} ${options.url}`,
        );
        if (options.request.retryCount === 0) {
          // only retries once
          console.log(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      onAbuseLimit: (retryAfter = 0, options: any) => {
        console.warn(
          `Abuse detected for request ${options.method} ${options.url}`,
        );
        if (options.request.retryCount === 0) {
          // only retries once
          console.log(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
    },
    previews: ['ant-man'],
  });

  if (onlyDeactivateDeployments === 'true') {
    deleteDeployment = false;
    deleteEnvironment = false;
  } else if (onlyRemoveDeployments === 'true') {
    deleteEnvironment = false;
  }
  core.debug(`Try to list deployments`);
  try {
    const deploymentRefs = await listDeployments(client, {
      ...context.repo,
      environment,
      ref,
    });
    core.info(`Found ${deploymentRefs.length} deployments`);
    let deploymentIds: number[];
    let deleteDeploymentMessage: string;
    let deactivateDeploymentMessage: string;
    if (ref.length > 0) {
      deleteDeploymentMessage = `deleting deployment ref ${ref} in environment ${environment}`;
      deactivateDeploymentMessage = `deactivating deployment ref ${ref} in environment ${environment}`;
      deploymentIds = deploymentRefs
        .filter((deployment) => deployment.ref === ref)
        .map((deployment) => deployment.deploymentId);
    } else {
      deleteDeploymentMessage = `deleting all ${deploymentRefs.length} deployments in environment ${environment}`;
      deactivateDeploymentMessage = `deactivating all ${deploymentRefs.length} deployments in environment ${environment}`;
      deploymentIds = deploymentRefs.map(
        (deployment) => deployment.deploymentId,
      );
    }
    core.info(deactivateDeploymentMessage);
    await Promise.all(
      deploymentIds.map((deploymentId) =>
        setDeploymentInactive(client, { ...context.repo, deploymentId }),
      ),
    );

    if (deleteDeployment) {
      core.info(deleteDeploymentMessage);
      await Promise.all(
        deploymentIds.map((deploymentId) =>
          deleteDeploymentById(client, { ...context.repo, deploymentId }),
        ),
      );
    }

    if (deleteEnvironment) {
      await deleteTheEnvironment(client, environment, context.repo);
    }
    core.info('done');
  } catch (error) {
    core.setFailed((error as RequestError).message);
  }
}

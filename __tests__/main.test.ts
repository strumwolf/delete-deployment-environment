import anyTest, { TestInterface } from 'ava';
import * as github from '@actions/github';
import { Octokit } from '@octokit/core';
import { main } from '../src/execute';

const test = anyTest as TestInterface<{
  token: string;
  ref: string;
  octokit: Octokit;
  repo: { owner: string; repo: string };
}>;

interface response {
  id: number;
}

interface Context {
  owner: string;
  repo: string;
  ref?: string;
}

async function createEnvironment(
  octokit: Octokit,
  environmentName: string,
  { owner, repo }: Context,
): Promise<void> {
  await octokit.request(
    'PUT /repos/{owner}/{repo}/environments/{environment_name}',
    {
      owner,
      repo,
      environment_name: environmentName,
    },
  );
  console.log('env created');
}

async function createDeploymentWithStatus(
  octokit: Octokit,
  environment: string,
  { owner, repo, ref = 'main' }: Context,
): Promise<void> {
  const createdDeployment = await octokit.request(
    'POST /repos/{owner}/{repo}/deployments',
    {
      owner,
      repo,
      ref,
      environment,
    },
  );
  const data = createdDeployment.data;
  await octokit.request(
    'POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses',
    {
      owner: owner,
      repo: repo,
      state: 'success',
      deployment_id: data['id'],
    },
  );
}

async function getDeployments(
  octokit: Octokit,
  environment: string,
  { owner, repo }: Context,
): Promise<number[]> {
  const { data } = await octokit.request(
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

test.beforeEach(async (t) => {
  process.env.GITHUB_REPOSITORY = 'strumwolf/delete-deployment-environment';
  process.env.GITHUB_REF = 'main';
  github.context.ref = process.env.GITHUB_REF;
  const { GITHUB_TOKEN = '' } = process.env;
  const { repo, ref } = github.context;
  const octokit = new Octokit({
    auth: GITHUB_TOKEN,
  });
  t.context = {
    token: GITHUB_TOKEN,
    ref,
    octokit,
    repo,
  };
  process.env.INPUT_TOKEN = process.env.GITHUB_TOKEN;
});

test.serial('should successfully remove environment', async (t) => {
  const { octokit, repo, ref } = t.context;
  const context: Context = repo;
  const environment = 'test-full-env-removal';
  await createEnvironment(octokit, environment, context);
  await createDeploymentWithStatus(octokit, environment, { ...context, ref });
  process.env.INPUT_ENVIRONMENT = environment;
  await main();
  let environmentExists = true;
  try {
    await octokit.request(
      'GET /repos/{owner}/{repo}/environments/{environment_name}',
      {
        owner: repo.owner,
        repo: repo.repo,
        environment_name: environment,
      },
    );
  } catch (err) {
    // status 404 indicates that the environment cannot be found in the repo
    environmentExists = err.status === 404 ? false : true;
  }
  t.falsy(environmentExists);
});

test.serial(
  'should successfully remove deployments when environment has not been created',
  async (t) => {
    const { octokit, repo, ref } = t.context;
    const context: Context = repo;
    const environment = 'test-remove-without-creating-environment';
    await createDeploymentWithStatus(octokit, environment, { ...context, ref });
    process.env.INPUT_ENVIRONMENT = environment;
    await main();
    let environmentExists = true;
    try {
      await octokit.request(
        'GET /repos/{owner}/{repo}/environments/{environment_name}',
        {
          owner: repo.owner,
          repo: repo.repo,
          environment_name: environment,
        },
      );
    } catch (err) {
      // status 404 indicates that the environment cannot be found in the repo
      environmentExists = err.status === 404 ? false : true;
    }
    t.falsy(environmentExists);
    const deploymentsId = await getDeployments(octokit, environment, context);
    t.is(deploymentsId.length, 0);
  },
);

test.serial(
  'should successfully remove deployments and not remove environment',
  async (t) => {
    const { octokit, repo, ref } = t.context;
    const context: Context = repo;
    const environment = 'test-remove-deployments-only';
    await createEnvironment(octokit, environment, context);
    await createDeploymentWithStatus(octokit, environment, { ...context, ref });
    process.env.INPUT_ENVIRONMENT = environment;
    process.env.INPUT_ONLYREMOVEDEPLOYMENTS = 'true';
    await main();
    let environmentExists = false;
    try {
      const res = await octokit.request(
        'GET /repos/{owner}/{repo}/environments/{environment_name}',
        {
          owner: repo.owner,
          repo: repo.repo,
          environment_name: environment,
        },
      );
      environmentExists = res.status === 200 ? true : false;
    } catch (err) {
      t.log(err);
      t.fail();
    }
    t.truthy(environmentExists);
    const deploymentsId = await getDeployments(octokit, environment, context);
    t.is(deploymentsId.length, 0);
    // delete all artifacts
    delete process.env.INPUT_ONLYREMOVEDEPLOYMENTS;
    await main();
  },
);

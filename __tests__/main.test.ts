import anyTest, { TestInterface } from 'ava';
import * as github from '@actions/github';
import { Octokit } from '@octokit/core';
import { DeploymentRef, main } from '../src/execute';

const test = anyTest as TestInterface<{
  token: string;
  ref: string;
  octokit: Octokit;
  repo: { owner: string; repo: string };
}>;

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
}

async function createDeploymentWithStatus(
  octokit: Octokit,
  environment: string,
  { owner, repo, ref = 'main' }: Context,
): Promise<void> {
  await octokit.request('POST /repos/{owner}/{repo}/deployments', {
    owner,
    repo,
    ref,
    environment,
    required_contexts: [],
  });
  const { data } = await octokit.request(
    'GET /repos/{owner}/{repo}/deployments',
    {
      owner,
      repo,
      environment,
    },
  );
  const [deployment] = data;
  const { id } = deployment;
  await octokit.request(
    'POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses',
    {
      owner: owner,
      repo: repo,
      state: 'success',
      deployment_id: id,
    },
  );
}

async function getDeployments(
  octokit: Octokit,
  environment: string,
  { owner, repo }: Context,
): Promise<DeploymentRef[]> {
  const { data } = await octokit.request(
    'GET /repos/{owner}/{repo}/deployments',
    {
      owner,
      repo,
      environment,
    },
  );
  const deploymentRefs: DeploymentRef[] = data.map((deployment) => ({
    deploymentId: deployment.id,
    ref: deployment.ref,
  }));
  return deploymentRefs;
}

test.beforeEach(async (t) => {
  process.env.GITHUB_REPOSITORY = 'strumwolf/delete-deployment-environment';
  process.env.GITHUB_REF = 'main';
  github.context.ref = process.env.GITHUB_REF;
  const { GITHUB_TOKEN = '' } = process.env;
  const { repo, ref } = github.context;
  // const octokit: Octokit = github.getOctokit(GITHUB_TOKEN, {
  //   previews: ['ant-man'],
  // });
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
  t.timeout(60000);
  const { octokit, repo, ref } = t.context;
  const context: Context = repo;
  const environment = 'test-full-env-removal';
  try {
    await createEnvironment(octokit, environment, context);
    await createDeploymentWithStatus(octokit, environment, { ...context, ref });
  } catch (err) {
    t.log(err);
    t.fail();
  }

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
    const deployments = await getDeployments(octokit, environment, context);
    t.is(deployments.length, 0);
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
    const deployments = await getDeployments(octokit, environment, context);
    t.is(deployments.length, 0);
    // delete all artifacts
    delete process.env.INPUT_ONLYREMOVEDEPLOYMENTS;
    await main();
  },
);

test.serial(
  'should successfully remove deployment ref only and not remove environment',
  async (t) => {
    const environment = 'test-remove-deployment-ref-only';
    const { octokit, repo, ref } = t.context;
    const context: Context = repo;
    await createEnvironment(octokit, environment, context);
    await createDeploymentWithStatus(octokit, environment, {
      ...context,
      ref,
    });
    // make sure this branch exists to create another deployment
    const newRef = 'delete-by-ref';
    await createDeploymentWithStatus(octokit, environment, {
      ...context,
      ref: newRef,
    });
    process.env.INPUT_ENVIRONMENT = environment;
    process.env.INPUT_REF = newRef;
    process.env.INPUT_ONLYREMOVEDEPLOYMENTS = 'true';
    await main();
    let environmentExists = false;
    let deployments: DeploymentRef[] = [];
    try {
      const res = await octokit.request(
        'GET /repos/{owner}/{repo}/environments/{environment_name}',
        {
          owner: repo.owner,
          repo: repo.repo,
          environment_name: environment,
        },
      );
      environmentExists = res.status === 200;
      deployments = await getDeployments(octokit, environment, context);
    } catch (err) {
      t.log(err);
      t.fail();
    }
    t.truthy(environmentExists);
    t.is(deployments.length, 1);
    t.is(deployments[0].ref, 'main');
    // clean up main
    process.env.INPUT_REF = 'main';
    await main();
    // delete all artifacts
    delete process.env.INPUT_ONLYREMOVEDEPLOYMENTS;
    await main();
  },
);

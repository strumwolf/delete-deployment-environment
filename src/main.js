const core = require('@actions/core');
const github = require('@actions/github');

const listDeploymentIds = async (client, { owner, repo, environment }) => {
  const { data } = await client.repos.listDeployments({
    owner,
    repo,
    environment,
  });
  return data.map((deployment) => deployment.id);
};

const setDeploymentInactive = async (client, { owner, repo, deploymentId }) =>
  client.repos.createDeploymentStatus({
    deployment_id: deploymentId,
    state: 'inactive',
    owner,
    repo,
  });

async function main() {
  const { context } = github;
  const token = core.getInput('token', { required: true });
  const environment = core.getInput('environment', { required: true });
  const client = github.getOctokit(token, { previews: ['ant-man'] });
  let deploymentIds;

  try {
    deploymentIds = await listDeploymentIds(client, {
      ...context.repo,
      environment,
    });

    await Promise.all(
      deploymentIds.map(async (id) =>
        setDeploymentInactive(client, {
          ...context.repo,
          deploymentId: id,
        }),
      ),
    );

    await Promise.all(
      deploymentIds.map(async (id) =>
        client.repos.deleteDeployment({ ...context.repo, deployment_id: id }),
      ),
    );
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();

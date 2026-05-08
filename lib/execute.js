import * as core from '@actions/core';
import * as github from '@actions/github';
async function listDeployments(client, { owner, repo, environment, ref = '' }, page = 0) {
    core.debug(`Getting list of deployments in environment ${environment}`);
    const { data } = await client.request('GET /repos/{owner}/{repo}/deployments', {
        owner,
        repo,
        environment,
        ref,
        per_page: 100,
        page,
    });
    const deploymentRefs = data.map((deployment) => ({
        deploymentId: deployment.id,
        ref: deployment.ref,
    }));
    core.debug(`Getting total of ${deploymentRefs.length} deployments on page ${page} `);
    if (deploymentRefs.length === 100)
        return deploymentRefs.concat(await listDeployments(client, { owner, repo, environment, ref }, page + 1));
    return deploymentRefs;
}
async function setDeploymentInactive(client, { owner, repo, deploymentId }) {
    await client.request('POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses', {
        owner,
        repo,
        deployment_id: deploymentId,
        state: 'inactive',
    });
}
async function deleteDeploymentById(client, { owner, repo, deploymentId }) {
    await client.request('DELETE /repos/{owner}/{repo}/deployments/{deployment_id}', {
        owner,
        repo,
        deployment_id: deploymentId,
    });
}
async function deleteTheEnvironment(client, environment, { owner, repo }) {
    let existingEnv = false;
    try {
        const getEnvResult = await client.request('GET /repos/{owner}/{repo}/environments/{environment_name}', {
            owner,
            repo,
            environment_name: environment,
        });
        existingEnv = typeof getEnvResult === 'object';
    }
    catch (err) {
        if (err.status !== 404) {
            core.error('Error deleting environment');
            throw err;
        }
    }
    if (existingEnv) {
        core.info(`deleting environment ${environment}`);
        await client.request('DELETE /repos/{owner}/{repo}/environments/{environment_name}', {
            owner,
            repo,
            environment_name: environment,
        });
        core.info(`environment ${environment} deleted`);
    }
}
export async function main() {
    let deleteDeployment = true;
    let deleteEnvironment = true;
    const { context } = github;
    const token = core.getInput('token', { required: true });
    const environment = core.getInput('environment', { required: true });
    const onlyRemoveDeployments = core.getInput('onlyRemoveDeployments', {
        required: false,
    });
    const onlyDeactivateDeployments = core.getInput('onlyDeactivateDeployments', {
        required: false,
    });
    const ref = core.getInput('ref', { required: false });
    core.debug(`Starting Deployment Deletion action`);
    const client = github.getOctokit(token, {
        throttle: {
            onRateLimit: (retryAfter = 0, options) => {
                console.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
                if (options.request.retryCount === 0) {
                    // only retries once
                    console.log(`Retrying after ${retryAfter} seconds!`);
                    return true;
                }
            },
            onAbuseLimit: (retryAfter = 0, options) => {
                console.warn(`Abuse detected for request ${options.method} ${options.url}`);
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
    }
    else if (onlyRemoveDeployments === 'true') {
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
        let deploymentIds;
        let deleteDeploymentMessage;
        let deactivateDeploymentMessage;
        if (ref.length > 0) {
            deleteDeploymentMessage = `deleting deployment ref ${ref} in environment ${environment}`;
            deactivateDeploymentMessage = `deactivating deployment ref ${ref} in environment ${environment}`;
            deploymentIds = deploymentRefs
                .filter((deployment) => deployment.ref === ref)
                .map((deployment) => deployment.deploymentId);
        }
        else {
            deleteDeploymentMessage = `deleting all ${deploymentRefs.length} deployments in environment ${environment}`;
            deactivateDeploymentMessage = `deactivating all ${deploymentRefs.length} deployments in environment ${environment}`;
            deploymentIds = deploymentRefs.map((deployment) => deployment.deploymentId);
        }
        core.info(deactivateDeploymentMessage);
        await Promise.all(deploymentIds.map((deploymentId) => setDeploymentInactive(client, { ...context.repo, deploymentId })));
        if (deleteDeployment) {
            core.info(deleteDeploymentMessage);
            await Promise.all(deploymentIds.map((deploymentId) => deleteDeploymentById(client, { ...context.repo, deploymentId })));
        }
        if (deleteEnvironment) {
            await deleteTheEnvironment(client, environment, context.repo);
        }
        core.info('done');
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
//# sourceMappingURL=execute.js.map
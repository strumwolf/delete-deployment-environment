'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, {
          enumerable: true,
          get: function () {
            return m[k];
          },
        });
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null)
      for (var k in mod)
        if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
  };
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.main = void 0;
const core = __importStar(require('@actions/core'));
const github = __importStar(require('@actions/github'));
function listDeployments(
  client,
  { owner, repo, environment, ref = '' },
  page = 0,
) {
  return __awaiter(this, void 0, void 0, function* () {
    const { data } = yield client.request(
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
    const deploymentRefs = data.map((deployment) => ({
      deploymentId: deployment.id,
      ref: deployment.ref,
    }));
    if (deploymentRefs.length === 100)
      return deploymentRefs.concat(
        yield listDeployments(
          client,
          { owner, repo, environment, ref },
          page++,
        ),
      );
    return deploymentRefs;
  });
}
function setDeploymentInactive(client, { owner, repo, deploymentId }) {
  return __awaiter(this, void 0, void 0, function* () {
    yield client.request(
      'POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses',
      {
        owner,
        repo,
        deployment_id: deploymentId,
        state: 'inactive',
      },
    );
  });
}
function deleteDeploymentById(client, { owner, repo, deploymentId }) {
  return __awaiter(this, void 0, void 0, function* () {
    yield client.request(
      'DELETE /repos/{owner}/{repo}/deployments/{deployment_id}',
      {
        owner,
        repo,
        deployment_id: deploymentId,
      },
    );
  });
}
function deleteTheEnvironment(client, environment, { owner, repo }) {
  return __awaiter(this, void 0, void 0, function* () {
    let existingEnv = false;
    try {
      const getEnvResult = yield client.request(
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
      yield client.request(
        'DELETE /repos/{owner}/{repo}/environments/{environment_name}',
        {
          owner,
          repo,
          environment_name: environment,
        },
      );
      core.info(`environment ${environment} deleted`);
    }
  });
}
function main() {
  return __awaiter(this, void 0, void 0, function* () {
    let deleteDeployment = true;
    let deleteEnvironment = true;
    const { context } = github;
    const token = core.getInput('token', { required: true });
    const environment = core.getInput('environment', { required: true });
    const onlyRemoveDeployments = core.getInput('onlyRemoveDeployments', {
      required: false,
    });
    const onlyDeactivateDeployments = core.getInput(
      'onlyDeactivateDeployments',
      {
        required: false,
      },
    );
    const ref = core.getInput('ref', { required: false });
    const client = github.getOctokit(token, { previews: ['ant-man'] });
    if (onlyDeactivateDeployments === 'true') {
      deleteDeployment = false;
      deleteEnvironment = false;
    } else if (onlyRemoveDeployments === 'true') {
      deleteEnvironment = false;
    }
    try {
      const deploymentRefs = yield listDeployments(
        client,
        Object.assign(Object.assign({}, context.repo), { environment, ref }),
      );
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
      } else {
        deleteDeploymentMessage = `deleting all ${deploymentRefs.length} deployments in environment ${environment}`;
        deactivateDeploymentMessage = `deactivating all ${deploymentRefs.length} deployments in environment ${environment}`;
        deploymentIds = deploymentRefs.map(
          (deployment) => deployment.deploymentId,
        );
      }
      core.info(deactivateDeploymentMessage);
      yield Promise.all(
        deploymentIds.map((deploymentId) =>
          setDeploymentInactive(
            client,
            Object.assign(Object.assign({}, context.repo), { deploymentId }),
          ),
        ),
      );
      if (deleteDeployment) {
        core.info(deleteDeploymentMessage);
        yield Promise.all(
          deploymentIds.map((deploymentId) =>
            deleteDeploymentById(
              client,
              Object.assign(Object.assign({}, context.repo), { deploymentId }),
            ),
          ),
        );
      }
      if (deleteEnvironment) {
        yield deleteTheEnvironment(client, environment, context.repo);
      }
      core.info('done');
    } catch (error) {
      core.setFailed(error.message);
    }
  });
}
exports.main = main;
//# sourceMappingURL=execute.js.map

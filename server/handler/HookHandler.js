import { Approval, Autobranch, CommitMessage } from '../checks'
import { logger } from '../../common/debug'
import { githubService } from '../service/GithubService'
import { repositoryHandler } from './RepositoryHandler'
import { pullRequestHandler } from './PullRequestHandler'
import ZapprConfiguration from '../zapprfile/Configuration'

const info = logger('hook', 'info')

class HookHandler {
  constructor(github = githubService) {
    this.github = github
  }

  /**
   * Executes hook triggered by Github.
   *
   * @param  {string} event
   * @param  {object} payload
   * @return {object}
   */
  async onHandleHook(event, payload) {
    async function getToken(dbRepo, checkType) {
      const check = dbRepo.checks.filter(check => check.type === checkType && !!check.token)[0]
      if (!!check) {
        return Promise.resolve(check.token)
      }
    }

    if (payload.repository) {
      const {name, id, owner} = payload.repository
      const repo = await repositoryHandler.onGetOne(id, null, true)
      let config = {}
      if (repo.checks.length) {
        const zapprFileContent = await this.github.readZapprFile(owner.login, name, repo.checks[0].token)
        const zapprfile = new ZapprConfiguration(zapprFileContent)
        config = zapprfile.isValid() ? zapprfile.getConfiguration() : config
      }

      if (Approval.isTriggeredBy(event)) {
        getToken(repo, Approval.TYPE).then(token =>
          Approval.execute(this.github, config, payload, token, repo.id, pullRequestHandler)
        )
      }
      if (Autobranch.isTriggeredBy(event)) {
        getToken(repo, Autobranch.TYPE).then(token =>
          Autobranch.execute(this.github, config, payload, token)
        )
      }
      if (CommitMessage.isTriggeredBy(event)) {
        getToken(repo, CommitMessage.TYPE).then(token =>
          CommitMessage.execute(this.github, config, payload, token)
        )
      }
    }
    return {
      message: "THANKS"
    }
  }
}

export const hookHandler = new HookHandler()

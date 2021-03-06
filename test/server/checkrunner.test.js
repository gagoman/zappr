import { expect } from 'chai'
import sinon from 'sinon'
import { GithubService } from '../../server/service/GithubService'
import { PullRequestHandler } from '../../server/handler/PullRequestHandler'
import CheckRunner from '../../server/checks/CheckRunner'
import {
  Approval,
  Autobranch,
  CommitMessage,
  Specification,
  PullRequestLabels,
  PullRequestTasks,
  CHECK_TYPES
} from '../../server/checks'

const PR_TYPES = [
  Approval.TYPE,
  Specification.TYPE,
  PullRequestLabels.TYPE,
  PullRequestTasks.TYPE,
  CommitMessage.TYPE,
]
const DB_REPO = {
  id: 1,
  checks: CHECK_TYPES.map(type => ({
    type,
    token: 'token'
  })),
  json: {
    owner: {
      login: 'mxfoo'
    },
    name: 'hello-world'
  }
}
const CONFIG = {}
const DB_PR = {
  last_push: new Date()
}
const PULL_REQUEST = {
  number: 2,
  head: {
    sha: 'commit-id'
  }
}

describe('CheckRunner', () => {
  let checkRunner, github, pullRequestHandler
  beforeEach(() => {
    github = sinon.createStubInstance(GithubService)
    pullRequestHandler = sinon.createStubInstance(PullRequestHandler)

    pullRequestHandler.onGetOne = sinon.stub().returns(DB_PR)
    github.getPullRequests = sinon.stub().returns([PULL_REQUEST])
    checkRunner = new CheckRunner(github, pullRequestHandler)
  })

  describe('#release', () => {
    it('should set the head status to success', async(done) => {
      try {
        await checkRunner.release(DB_REPO, Approval.TYPE, 'user-token')
        expect(github.setCommitStatus.args.length).to.equal(1)
        expect(github.setCommitStatus.args[0]).to.deep.equal([
          'mxfoo',
          'hello-world',
          'commit-id',
          {
            state: 'success',
            description: 'This check is disabled.',
            context: Approval.CONTEXT
          },
          'user-token'
        ])

        expect(github.getPullRequests.args.length).to.equal(1)
        expect(github.getPullRequests.args[0]).to.deep.equal([
          'mxfoo',
          'hello-world',
          'user-token',
          'open',
          true
        ])
        done()
      } catch (e) {
        done(e)
      }
    })
  })

  describe('#handleExistingPullRequests', () => {
    PR_TYPES.forEach(type => {
      it(`[${type}] it proxies to the correct function`, async(done) => {
        try {
          checkRunner.approval.fetchApprovalsAndSetStatus = sinon.stub()
          checkRunner.specification.validate = sinon.stub()
          checkRunner.pullRequestLabels.fetchLabelsAndSetStatus = sinon.stub()
          checkRunner.pullRequestTasks.countTasksAndSetStatus = sinon.stub()
          checkRunner.commitMessage.fetchCommitsAndSetStatus = sinon.stub()

          await checkRunner.handleExistingPullRequests(DB_REPO, type, {config: CONFIG, token: 'user-token'})
          expect(github.getPullRequests.args.length).to.equal(1)
          expect(github.getPullRequests.args[0]).to.deep.equal([
            'mxfoo',
            'hello-world',
            'user-token',
            'open',
            true
          ])

          switch (type) {
            case Approval.TYPE:
              expect(checkRunner.approval.fetchApprovalsAndSetStatus.calledOnce).to.be.true
              break
            case Specification.TYPE:
              expect(checkRunner.specification.validate.calledOnce).to.be.true
              break
            case PullRequestLabels.TYPE:
              expect(checkRunner.pullRequestLabels.fetchLabelsAndSetStatus.calledOnce).to.be.true
              break
            case PullRequestTasks.TYPE:
              expect(checkRunner.pullRequestTasks.countTasksAndSetStatus.calledOnce).to.be.true
              break
            case CommitMessage.TYPE:
              expect(checkRunner.commitMessage.fetchCommitsAndSetStatus.calledOnce).to.be.true
              break
            default:
              throw new Error(`Type ${type} not covered by this test.`)
          }

          done()
        } catch (e) {
          done(e)
        }
      })
    })
  })
  describe('#handleGithubWebhook', () => {
    CHECK_TYPES.forEach(type => {
      it(`[${type}] merges token into provided args and calls execute`, async(done)=> {
        try {
          const CHECK_PROPS = {
            [Approval.TYPE]: 'approval',
            [Autobranch.TYPE]: 'autobranch',
            [Specification.TYPE]: 'specification',
            [PullRequestLabels.TYPE]: 'pullRequestLabels',
            [PullRequestTasks.TYPE]: 'pullRequestTasks',
            [CommitMessage.TYPE]: 'commitMessage',
          }
          Object.keys(CHECK_PROPS)
                .forEach(checkType => sinon.stub(checkRunner[CHECK_PROPS[checkType]], 'execute'))

          const fnExpectedToBeCalled = checkRunner[CHECK_PROPS[type]]['execute']
          let event
          switch (type) {
            case Approval.TYPE:
              event = Approval.HOOK_EVENTS[0]
              break;
            case Autobranch.TYPE:
              event = Autobranch.HOOK_EVENTS[0]
              break;
            case Specification.TYPE:
              event = Specification.HOOK_EVENTS[0]
              break;
            case PullRequestLabels.TYPE:
              event = PullRequestLabels.HOOK_EVENTS[0]
              break;
            case PullRequestTasks.TYPE:
              event = PullRequestTasks.HOOK_EVENTS[0]
              break;
            case CommitMessage.TYPE:
              event = CommitMessage.HOOK_EVENTS[0]
              break;
            default:
              throw new Error(`Type ${type} not covered by this test.`)
          }
          const config = {}
          const payload = {}
          const dbRepoId = 1
          await checkRunner.handleGithubWebhook(DB_REPO, {event, config, payload, dbRepoId})

          expect(fnExpectedToBeCalled.calledOnce).to.be.true

          if (type === Approval.TYPE) {
            expect(fnExpectedToBeCalled.args[0]).to.deep.equal([
              config,
              event,
              payload,
              'token',
              dbRepoId
            ])
          } else {
            expect(fnExpectedToBeCalled.args[0]).to.deep.equal([
              config,
              payload,
              'token',
            ])
          }
          done()
        }
        catch (e) {
          done(e)
        }
      })
    })
  })
})

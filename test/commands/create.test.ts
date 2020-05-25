import { random } from 'faker';
import nock from 'nock';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import marked from 'marked';
import { translate } from '../../src/locales';
import { getChatClass, taskTracker, cleanRedis } from '../test-utils';
import jiraProject from '../fixtures/jira-api-requests/project-gens/classic/correct.json';
import postNewLinksbody from '../fixtures/webhooks/issuelink/created_relates.json';
import issueLinkBody from '../fixtures/jira-api-requests/issuelinkRelates.json';
import issueBody from '../fixtures/jira-api-requests/issue.json';
import { postNewLinks } from '../../src/bot/actions/post-new-links';
import { getPostNewLinksData } from '../../src/jira-hook-parser/parsers/jira/parse-body';
import { getPostLinkMessageBody } from '../../src/bot/actions/helper';
import { config } from '../../src/config';
import { commandsHandler } from '../../src/bot/commands';
import * as utils from '../../src/lib/utils';
import { schemas } from '../../src/task-trackers/jira/schemas';

const { expect } = chai;
chai.use(sinonChai);

describe('create test', () => {
    let chatApi;
    let baseOptions;
    const roomName = `${jiraProject.key}-123`;
    const projectKey = jiraProject.key;
    const projectId = jiraProject.id;
    const sender = jiraProject.lead.displayName;
    const issueLinkId = postNewLinksbody.issueLink.id;
    const roomId = random.number();
    const commandName = 'create';
    const bodyText = '';
    const { issueTypes } = jiraProject;
    const projectIssueTypes = issueTypes.map(item => item.name);

    beforeEach(() => {
        chatApi = getChatClass().chatApiSingle;
        chatApi.getRoomId.withArgs(utils.getInwardLinkKey(issueLinkBody)).resolves(roomId);
        chatApi.getRoomId.withArgs(utils.getOutwardLinkKey(issueLinkBody)).resolves(roomId);
        baseOptions = { roomId, roomName, commandName, sender, chatApi, bodyText, taskTracker, config };
        nock(utils.getRestUrl())
            .get(`/project/${projectKey}`)
            .reply(200, jiraProject)
            .post(`/issue`, schemas.issueNotChild('abracadabra', '10002', projectId))
            .times(3)
            .reply(201, { key: 'BBCOM-123' })
            .post(`/issueLink`, schemas.issueLink('BBCOM-123', 'BBCOM-123'))
            .reply(201)
            .get(`/issueLink/${issueLinkId}`)
            .reply(200, issueLinkBody)
            .get(`/issue/${issueLinkBody.outwardIssue.key}`)
            .times(2)
            .reply(200, issueBody)
            .get(`/issue/${issueLinkBody.inwardIssue.key}`)
            .times(2)
            .reply(200, issueBody)
            .get(`/issue/BBCOM-123`)
            .times(2)
            .reply(200, issueBody);
    });

    afterEach(async () => {
        nock.cleanAll();
        await cleanRedis();
    });

    it('Expect message with list task types for current project IF command !create called without any params', async () => {
        const post = utils.ignoreKeysInProject(projectKey, projectIssueTypes);
        const result = await commandsHandler(baseOptions);

        expect(chatApi.sendHtmlMessage).to.be.called;
        expect(result).to.be.eq(post);
    });

    it('Expect message "No name issue" IF command "!create TestTypeTask" called with correct type issue and without new issue name', async () => {
        const post = translate('issueNameExist');
        const result = await commandsHandler({ ...baseOptions, bodyText: 'TestTypeTask' });

        expect(result).to.be.eq(post);
        expect(chatApi.sendHtmlMessage).to.be.calledWithExactly(roomId, post, post);
    });

    it('Expect create new issue and receive hook "new link - relates to" IF command "!create TestTypeTask" with correct type issue and correct new issue name', async () => {
        const result = await commandsHandler({ ...baseOptions, bodyText: 'TestTypeTask abracadabra' });

        const body = getPostLinkMessageBody({
            relation: issueLinkBody.type.outward,
            related: issueLinkBody.outwardIssue,
        });

        const data = getPostNewLinksData(postNewLinksbody);
        const res = await postNewLinks({ ...data, config, taskTracker, chatApi });

        expect(result).to.be.undefined;
        expect(res).to.be.true;
        expect(chatApi.sendHtmlMessage).to.be.calledWithExactly(roomId, body.body, body.htmlBody);
    });

    it.skip('Expect create new issue SUB-TASK ', async () => {
        nock.cleanAll();
        nock(utils.getRestUrl())
            .get(`/project/${projectKey}`)
            .reply(200, jiraProject)
            .get(`/issue/BBCOM-123`)
            .reply(200, issueBody)
            // issueChild: (summary, issueTypeId, projectId, parentId)
            .post(`/issue`, schemas.issueChild('abracadabra', '10003', '10305', 'BBCOM-123'))
            .reply(201, { key: 'NEW-123' });
        const result = await commandsHandler({
            ...baseOptions,
            bodyText: 'Sub-task abracadabra',
        });

        const post = marked(
            translate('newTaskWasCreated', {
                newIssueKey: 'NEW-123',
                summary: 'abracadabra',
                viewUrl: 'https://jira.test-example.ru/jira/browse/NEW-123',
            }),
        );

        expect(result).not.to.be.undefined;
        expect(chatApi.sendHtmlMessage).to.be.calledWithExactly(roomId, post, post);
    });
});

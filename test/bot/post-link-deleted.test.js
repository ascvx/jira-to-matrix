const nock = require('nock');
const utils = require('../../src/lib/utils.js');
const linkDeletedHook = require('../fixtures/webhooks/issuelink/deleted.json');
const issueBody = require('../fixtures/jira-api-requests/issue.json');
const {getPostLinksDeletedData} = require('../../src/jira-hook-parser/parse-body.js');
const postLinksDeleted = require('../../src/bot/post-link-deleted');
const {isDeleteLinks} = require('../../src/jira-hook-parser/bot-handler.js');
const {getPostLinkMessageBody} = require('../../src/bot/helper');
const {cleanRedis} = require('../test-utils');

const chai = require('chai');
const {stub} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);

describe('Test postLinksDeleted', () => {
    const {sourceIssueId} = linkDeletedHook.issueLink;
    const {destinationIssueId} = linkDeletedHook.issueLink;

    const roomIDIn = 'inId';
    const roomIDOut = 'outId';
    const mclient = {
        sendHtmlMessage: stub(),
        getRoomId: stub(),
    };

    mclient.getRoomId.withArgs(utils.getKey(issueBody)).onFirstCall().resolves(roomIDIn);
    mclient.getRoomId.onSecondCall(utils.getKey(issueBody)).resolves(roomIDOut);

    before(() => {
        nock(utils.getRestUrl(), {
            reqheaders: {
                Authorization: utils.auth(),
            },
        })
            .get(`/issue/${sourceIssueId}`)
            .reply(200, issueBody)
            .get(`/issue/${destinationIssueId}`)
            .reply(200, issueBody);
    });

    afterEach(async () => {
        Object.values(mclient).map(val => val.resetHistory());
        await cleanRedis();
    });

    after(() => {
        nock.cleanAll();
    });

    it('Expect return true after isDeleteLinks', () => {
        const res = isDeleteLinks(linkDeletedHook);
        expect(res).to.be.true;
    });

    it('Expect result to be correct after handling parser', () => {
        const expected = {
            sourceIssueId,
            destinationIssueId,
            sourceRelation: linkDeletedHook.issueLink.issueLinkType.outwardName,
            destinationRelation: linkDeletedHook.issueLink.issueLinkType.inwardName,
        };
        const res = getPostLinksDeletedData(linkDeletedHook);
        expect(res).to.be.deep.eq(expected);
    });

    it('Expect data to be handled by postLinksDeleted', async () => {
        const bodyIn = getPostLinkMessageBody({
            relation: linkDeletedHook.issueLink.issueLinkType.outwardName,
            related: issueBody,
        }, 'deleteLink');
        const bodyOut = getPostLinkMessageBody({
            relation: linkDeletedHook.issueLink.issueLinkType.inwardName,
            related: issueBody,
        }, 'deleteLink');

        const data = getPostLinksDeletedData(linkDeletedHook);
        const res = await postLinksDeleted({...data, mclient});

        expect(res).to.be.true;
        expect(mclient.sendHtmlMessage).to.be.calledWithExactly(roomIDIn, bodyIn.body, bodyIn.htmlBody);
        expect(mclient.sendHtmlMessage).to.be.calledWithExactly(roomIDOut, bodyOut.body, bodyOut.htmlBody);
    });

    it('Expect postlink throws error with expected data if smth wrong', async () => {
        let res;
        const data = getPostLinksDeletedData(linkDeletedHook);

        try {
            res = await postLinksDeleted({...data, mclient});
        } catch (err) {
            res = err;
        }

        expect(res).includes(utils.errorTracing('post delete link'));
    });
});

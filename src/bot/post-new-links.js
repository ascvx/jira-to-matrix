const Ramda = require('ramda');
const logger = require('../modules/log.js')(module);
const marked = require('marked');
const redis = require('../redis-client');
const jira = require('../jira');
const translate = require('../locales');

const postLink = async (issue, relation, related, mclient) => {
    const roomID = await mclient.getRoomId(issue.key);
    if (!roomID) {
        return;
    }
    const values = {
        relation,
        key: related.key,
        summary: Ramda.path(['fields', 'summary'], related),
        ref: jira.issue.ref(related.key),
    };
    await mclient.sendHtmlMessage(
        roomID,
        translate('newLink'),
        marked(translate('newLinkMessage', values))
    );
};

const handleLink = async (issueLink, mclient) => {
    try {
        const link = await jira.link.get(issueLink.id);
        if (!link) {
            return;
        }
        const isNew = await redis.setnxAsync(`link|${link.id}`, '1');

        if (!isNew) {
            return;
        }
        await postLink(link.inwardIssue, link.type.outward, link.outwardIssue, mclient);
        await postLink(link.outwardIssue, link.type.inward, link.inwardIssue, mclient);
    } catch (err) {
        logger.error(`Redis error while SETNX new link`);

        throw err;
    }
};

module.exports = async ({mclient, links}) => {
    logger.info('start postNewLinks');
    try {
        if (!links || links.length === 0) {
            logger.debug('No links to handle');
            return true;
        }

        await Promise.all(links.map(async issueLink => {
            await handleLink(issueLink, mclient);
        }));
        return true;
    } catch (err) {
        logger.error('error in postNewLinks');
        throw err;
    }
};

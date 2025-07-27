import { resolve } from 'path';
import { setFailed, getInput } from '@actions/core';
import { Context } from '@actions/github/lib/context';
import { isTargetEvent } from '@technote-space/filter-github-action';
import { ContextHelper } from '@technote-space/github-action-helper';
import { Logger } from '@technote-space/github-action-log-helper';
import { TARGET_EVENTS } from './constant';
import { execute } from './process';

const run = async(): Promise<void> => {
  const logger  = new Logger();
  const context = new Context();
  ContextHelper.showActionInfo(resolve(__dirname, '..'), logger, context);

  if (!isTargetEvent(TARGET_EVENTS, context)) {
    logger.info('This is not target event.');
    await execute(logger, context, true);
    return;
  }

  const base = getInput('BASE');
  const head = getInput('HEAD');
  if (context.eventName === 'workflow_dispatch' && (base === '' || head === '')) {
    logger.info('Missing inputs \'BASE\' or \'HEAD\' for workflow_dispatch event.');
    await execute(logger, context, true);
    return;
  }

  await execute(logger, context);
};

run().catch(error => {
  console.log(error);
  setFailed(error.message);
});

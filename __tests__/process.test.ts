/* eslint-disable no-magic-numbers */
import path from 'path';
import {
  testEnv,
  spyOnStdout,
  stdoutCalledWith,
  spyOnSpawn,
  testChildProcess,
  setChildProcessParams,
  execCalledWith,
  testFs,
  generateContext,
  getLogStdout,
} from '@technote-space/github-action-test-helper';
import {Logger} from '@technote-space/github-action-helper';
import {dumpDiffs, setResult, execute} from '../src/process';

const rootDir   = path.resolve(__dirname, '..');
const diffs     = [
  {
    file: 'test1',
    insertions: 1,
    deletions: 100,
    lines: 101,
    filterIgnored: false,
    prefixMatched: true,
    suffixMatched: true,
  },
  {
    file: 'test2',
    insertions: 2,
    deletions: 200,
    lines: 202,
    filterIgnored: false,
    prefixMatched: true,
    suffixMatched: true,
  },
  {
    file: 'test4',
    insertions: 4,
    deletions: 400,
    lines: 404,
    filterIgnored: true,
    prefixMatched: true,
    suffixMatched: false,
  },
];
const setExists = testFs(true);
const logger    = new Logger();
const prContext = generateContext({
  owner: 'hello',
  repo: 'world',
  event: 'pull_request',
  ref: 'refs/pull/55/merge',
}, {
  payload: {
    number: 11,
    'pull_request': {
      number: 11,
      id: 21031067,
      head: {
        ref: 'feature/new-feature',
      },
      base: {
        ref: 'master',
      },
      title: 'title',
      'html_url': 'test url',
    },
  },
});

describe('dumpDiffs', () => {
  testEnv(rootDir);

  it('should dump output', () => {
    const mockStdout = spyOnStdout();

    dumpDiffs(diffs, logger);

    stdoutCalledWith(mockStdout, [
      '::group::Dump diffs',
      getLogStdout([
        {
          'file': 'test1',
          'insertions': 1,
          'deletions': 100,
          'lines': 101,
          'filterIgnored': false,
          'prefixMatched': true,
          'suffixMatched': true,
        },
        {
          'file': 'test2',
          'insertions': 2,
          'deletions': 200,
          'lines': 202,
          'filterIgnored': false,
          'prefixMatched': true,
          'suffixMatched': true,
        },
        {
          'file': 'test4',
          'insertions': 4,
          'deletions': 400,
          'lines': 404,
          'filterIgnored': true,
          'prefixMatched': true,
          'suffixMatched': false,
        },
      ]),
      '::endgroup::',
    ]);
  });
});

describe('setResult', () => {
  testEnv(rootDir);

  it('should set result', () => {
    const mockStdout = spyOnStdout();

    setResult(diffs, false, logger);

    stdoutCalledWith(mockStdout, [
      '::group::Dump output',
      '::set-output name=diff::test1 test2 test4',
      '::set-env name=GIT_DIFF::test1 test2 test4',
      '"diff: test1 test2 test4"',
      '::set-output name=filtered_diff::test1 test2',
      '::set-env name=GIT_DIFF_FILTERED::test1 test2',
      '"filtered_diff: test1 test2"',
      '::set-output name=count::3',
      '"count: 3"',
      '::set-output name=insertions::3',
      '"insertions: 3"',
      '::set-output name=deletions::300',
      '"deletions: 300"',
      '::set-output name=lines::303',
      '"lines: 303"',
      '::endgroup::',
    ]);
  });

  it('should set result without env', () => {
    process.env.INPUT_SET_ENV_NAME            = '';
    process.env.INPUT_SET_ENV_NAME_COUNT      = 'FILE_COUNT';
    process.env.INPUT_SET_ENV_NAME_INSERTIONS = 'INSERTIONS';
    process.env.INPUT_SET_ENV_NAME_DELETIONS  = 'DELETIONS';
    process.env.INPUT_SET_ENV_NAME_LINES      = 'LINES';
    const mockStdout                          = spyOnStdout();

    setResult(diffs, false, logger);

    stdoutCalledWith(mockStdout, [
      '::group::Dump output',
      '::set-output name=diff::test1 test2 test4',
      '"diff: test1 test2 test4"',
      '::set-output name=filtered_diff::test1 test2',
      '::set-env name=GIT_DIFF_FILTERED::test1 test2',
      '"filtered_diff: test1 test2"',
      '::set-output name=count::3',
      '::set-env name=FILE_COUNT::3',
      '"count: 3"',
      '::set-output name=insertions::3',
      '::set-env name=INSERTIONS::3',
      '"insertions: 3"',
      '::set-output name=deletions::300',
      '::set-env name=DELETIONS::300',
      '"deletions: 300"',
      '::set-output name=lines::303',
      '::set-env name=LINES::303',
      '"lines: 303"',
      '::endgroup::',
    ]);
  });
});

describe('execute', () => {
  testEnv(rootDir);
  testChildProcess();

  it('should execute', async() => {
    process.env.GITHUB_WORKSPACE   = '/home/runner/work/my-repo-name/my-repo-name';
    process.env.INPUT_GITHUB_TOKEN = 'test token';

    const mockExec   = spyOnSpawn();
    const mockStdout = spyOnStdout();
    setChildProcessParams({
      stdout: (command: string): string => {
        if (command.startsWith('git diff')) {
          if (command.includes('shortstat')) {
            return '1 file changed, 25 insertions(+), 4 deletions(-)';
          }
          return 'package.json\nabc/composer.json\nREADME.md\nsrc/main.ts';
        }
        return '';
      },
    });

    await execute(logger, prContext);

    execCalledWith(mockExec, [
      'git remote add get-diff-action \'https://octocat:test token@github.com/hello/world.git\' > /dev/null 2>&1 || :',
      'git fetch --no-tags --no-recurse-submodules \'--depth=10000\' get-diff-action \'refs/pull/55/merge:refs/pull/55/merge\' \'refs/heads/master:refs/remotes/get-diff-action/master\' || :',
      'git diff \'get-diff-action/master...pull/55/merge\' \'--diff-filter=AMRC\' --name-only || :',
      'git diff \'get-diff-action/master...pull/55/merge\' --shortstat -w \'package.json\'',
      'git diff \'get-diff-action/master...pull/55/merge\' --shortstat -w \'abc/composer.json\'',
      'git diff \'get-diff-action/master...pull/55/merge\' --shortstat -w \'README.md\'',
      'git diff \'get-diff-action/master...pull/55/merge\' --shortstat -w \'src/main.ts\'',
    ]);
    stdoutCalledWith(mockStdout, [
      '[command]git remote add get-diff-action',
      '[command]git fetch --no-tags --no-recurse-submodules \'--depth=10000\' get-diff-action \'refs/pull/55/merge:refs/pull/55/merge\' \'refs/heads/master:refs/remotes/get-diff-action/master\'',
      '[command]git diff \'get-diff-action/master...pull/55/merge\' \'--diff-filter=AMRC\' --name-only',
      '  >> package.json',
      '  >> abc/composer.json',
      '  >> README.md',
      '  >> src/main.ts',
      '[command]git diff \'get-diff-action/master...pull/55/merge\' --shortstat -w \'package.json\'',
      '  >> 1 file changed, 25 insertions(+), 4 deletions(-)',
      '[command]git diff \'get-diff-action/master...pull/55/merge\' --shortstat -w \'abc/composer.json\'',
      '  >> 1 file changed, 25 insertions(+), 4 deletions(-)',
      '[command]git diff \'get-diff-action/master...pull/55/merge\' --shortstat -w \'README.md\'',
      '  >> 1 file changed, 25 insertions(+), 4 deletions(-)',
      '[command]git diff \'get-diff-action/master...pull/55/merge\' --shortstat -w \'src/main.ts\'',
      '  >> 1 file changed, 25 insertions(+), 4 deletions(-)',
      '::group::Dump diffs',
      getLogStdout([
        {
          'file': 'package.json',
          'filterIgnored': false,
          'prefixMatched': true,
          'suffixMatched': true,
          'insertions': 25,
          'deletions': 4,
          'lines': 29,
        },
        {
          'file': 'abc/composer.json',
          'filterIgnored': false,
          'prefixMatched': true,
          'suffixMatched': true,
          'insertions': 25,
          'deletions': 4,
          'lines': 29,
        },
        {
          'file': 'README.md',
          'filterIgnored': false,
          'prefixMatched': true,
          'suffixMatched': true,
          'insertions': 25,
          'deletions': 4,
          'lines': 29,
        },
        {
          'file': 'src/main.ts',
          'filterIgnored': false,
          'prefixMatched': true,
          'suffixMatched': true,
          'insertions': 25,
          'deletions': 4,
          'lines': 29,
        },
      ]),
      '::endgroup::',
      '::group::Dump output',
      '::set-output name=diff::\'package.json\' \'abc/composer.json\' \'README.md\' \'src/main.ts\'',
      '::set-env name=GIT_DIFF::\'package.json\' \'abc/composer.json\' \'README.md\' \'src/main.ts\'',
      '"diff: \'package.json\' \'abc/composer.json\' \'README.md\' \'src/main.ts\'"',
      '::set-output name=filtered_diff::\'package.json\' \'abc/composer.json\' \'README.md\' \'src/main.ts\'',
      '::set-env name=GIT_DIFF_FILTERED::\'package.json\' \'abc/composer.json\' \'README.md\' \'src/main.ts\'',
      '"filtered_diff: \'package.json\' \'abc/composer.json\' \'README.md\' \'src/main.ts\'"',
      '::set-output name=count::4',
      '"count: 4"',
      '::set-output name=insertions::100',
      '"insertions: 100"',
      '::set-output name=deletions::16',
      '"deletions: 16"',
      '::set-output name=lines::116',
      '"lines: 116"',
      '::endgroup::',
    ]);
  });

  it('should execute (no diff)', async() => {
    process.env.GITHUB_WORKSPACE    = '/home/runner/work/my-repo-name/my-repo-name';
    process.env.INPUT_GITHUB_TOKEN  = 'test token';
    process.env.INPUT_PREFIX_FILTER = 'test/';

    const mockExec   = spyOnSpawn();
    const mockStdout = spyOnStdout();
    setChildProcessParams({
      stdout: (command: string): string => {
        if (command.startsWith('git diff')) {
          if (command.includes('shortstat')) {
            return '1 file changed, 25 insertions(+), 4 deletions(-)';
          }
          return 'package.json\nabc/composer.json\nREADME.md\nsrc/main.ts';
        }
        return '';
      },
    });

    await execute(logger, prContext);

    execCalledWith(mockExec, [
      'git remote add get-diff-action \'https://octocat:test token@github.com/hello/world.git\' > /dev/null 2>&1 || :',
      'git fetch --no-tags --no-recurse-submodules \'--depth=10000\' get-diff-action \'refs/pull/55/merge:refs/pull/55/merge\' \'refs/heads/master:refs/remotes/get-diff-action/master\' || :',
      'git diff \'get-diff-action/master...pull/55/merge\' \'--diff-filter=AMRC\' --name-only || :',
    ]);
    stdoutCalledWith(mockStdout, [
      '[command]git remote add get-diff-action',
      '[command]git fetch --no-tags --no-recurse-submodules \'--depth=10000\' get-diff-action \'refs/pull/55/merge:refs/pull/55/merge\' \'refs/heads/master:refs/remotes/get-diff-action/master\'',
      '[command]git diff \'get-diff-action/master...pull/55/merge\' \'--diff-filter=AMRC\' --name-only',
      '  >> package.json',
      '  >> abc/composer.json',
      '  >> README.md',
      '  >> src/main.ts',
      '::group::Dump diffs',
      '[]',
      '::endgroup::',
      '::group::Dump output',
      '::set-output name=diff::',
      '::set-env name=GIT_DIFF::',
      '"diff: "',
      '::set-output name=filtered_diff::',
      '::set-env name=GIT_DIFF_FILTERED::',
      '"filtered_diff: "',
      '::set-output name=count::0',
      '"count: 0"',
      '::set-output name=insertions::0',
      '"insertions: 0"',
      '::set-output name=deletions::0',
      '"deletions: 0"',
      '::set-output name=lines::0',
      '"lines: 0"',
      '::endgroup::',
    ]);
  });

  it('should execute empty', async() => {
    process.env.GITHUB_WORKSPACE = '/home/runner/work/my-repo-name/my-repo-name';

    const mockExec   = spyOnSpawn();
    const mockStdout = spyOnStdout();

    await execute(logger, prContext, true);

    execCalledWith(mockExec, []);
    stdoutCalledWith(mockStdout, [
      '::group::Dump diffs',
      '[]',
      '::endgroup::',
      '::group::Dump output',
      '::set-output name=diff::',
      '::set-env name=GIT_DIFF::',
      '"diff: "',
      '::set-output name=filtered_diff::',
      '::set-env name=GIT_DIFF_FILTERED::',
      '"filtered_diff: "',
      '::set-output name=count::0',
      '"count: 0"',
      '::set-output name=insertions::0',
      '"insertions: 0"',
      '::set-output name=deletions::0',
      '"deletions: 0"',
      '::set-output name=lines::0',
      '"lines: 0"',
      '::endgroup::',
    ]);
  });

  it('should execute empty with default value', async() => {
    process.env.GITHUB_WORKSPACE            = '/home/runner/work/my-repo-name/my-repo-name';
    process.env.INPUT_DIFF_DEFAULT          = '1';
    process.env.INPUT_FILTERED_DIFF_DEFAULT = '2';
    process.env.INPUT_COUNT_DEFAULT         = '3';
    process.env.INPUT_INSERTIONS_DEFAULT    = '4';
    process.env.INPUT_DELETIONS_DEFAULT     = '5';
    process.env.INPUT_LINES_DEFAULT         = '6';

    const mockExec   = spyOnSpawn();
    const mockStdout = spyOnStdout();

    await execute(logger, prContext, true);

    execCalledWith(mockExec, []);
    stdoutCalledWith(mockStdout, [
      '::group::Dump diffs',
      '[]',
      '::endgroup::',
      '::group::Dump output',
      '::set-output name=diff::1',
      '::set-env name=GIT_DIFF::1',
      '"diff: 1"',
      '::set-output name=filtered_diff::2',
      '::set-env name=GIT_DIFF_FILTERED::2',
      '"filtered_diff: 2"',
      '::set-output name=count::3',
      '"count: 3"',
      '::set-output name=insertions::4',
      '"insertions: 4"',
      '::set-output name=deletions::5',
      '"deletions: 5"',
      '::set-output name=lines::6',
      '"lines: 6"',
      '::endgroup::',
    ]);
  });

  it('should not execute if not cloned', async() => {
    process.env.GITHUB_WORKSPACE = '/home/runner/work/my-repo-name/my-repo-name';

    const mockExec   = spyOnSpawn();
    const mockStdout = spyOnStdout();
    setChildProcessParams({
      stdout: (command: string): string => {
        if (command.startsWith('git diff')) {
          if (command.includes('shortstat')) {
            return '1 file changed, 25 insertions(+), 4 deletions(-)';
          }
          return 'package.json\nabc/composer.json\nREADME.md\nsrc/main.ts';
        }
        return '';
      },
    });
    setExists(false);

    await execute(logger, prContext);

    execCalledWith(mockExec, []);
    stdoutCalledWith(mockStdout, [
      '::warning::Please checkout before call this action.',
      '::group::Dump diffs',
      '[]',
      '::endgroup::',
      '::group::Dump output',
      '::set-output name=diff::',
      '::set-env name=GIT_DIFF::',
      '"diff: "',
      '::set-output name=filtered_diff::',
      '::set-env name=GIT_DIFF_FILTERED::',
      '"filtered_diff: "',
      '::set-output name=count::0',
      '"count: 0"',
      '::set-output name=insertions::0',
      '"insertions: 0"',
      '::set-output name=deletions::0',
      '"deletions: 0"',
      '::set-output name=lines::0',
      '"lines: 0"',
      '::endgroup::',
    ]);
  });
});

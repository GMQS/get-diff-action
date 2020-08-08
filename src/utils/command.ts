import path from 'path';
import {getInput} from '@actions/core' ;
import {Context} from '@actions/github/lib/context';
import {Logger, Command, Utils, GitHelper} from '@technote-space/github-action-helper';
import {escape, getDiffInfo} from './misc';
import {FileDiffResult, FileResult, DiffResult, DiffInfo} from '../types';
import {REMOTE_NAME} from '../constant';

const command                    = new Command(new Logger());
const getRawInput                = (name: string): string => process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '';
const getDot                     = (): string => getInput('DOT', {required: true});
const getFilter                  = (): string => getInput('DIFF_FILTER', {required: true});
const getSeparator               = (): string => getRawInput('SEPARATOR');
const getPrefix                  = (): string[] => Utils.getArrayInput('PREFIX_FILTER', undefined, '');
const getSuffix                  = (): string[] => Utils.getArrayInput('SUFFIX_FILTER', undefined, '');
const getFiles                   = (): string[] => Utils.getArrayInput('FILES', undefined, '');
const getWorkspace               = (): string => Utils.getBoolValue(getInput('ABSOLUTE')) ? (Utils.getWorkspace() + '/') : '';
const getSummaryIncludeFilesFlag = (): boolean => Utils.getBoolValue(getInput('SUMMARY_INCLUDE_FILES'));
const isFilterIgnored            = (item: string, files: string[]): boolean => !!(files.length && files.includes(path.basename(item)));
const isPrefixMatched            = (item: string, prefix: string[]): boolean => !prefix.length || !prefix.every(prefix => !Utils.getPrefixRegExp(prefix).test(item));
const isSuffixMatched            = (item: string, suffix: string[]): boolean => !suffix.length || !suffix.every(suffix => !Utils.getSuffixRegExp(suffix).test(item));
const toAbsolute                 = (item: string, workspace: string): string => workspace + item;

const getCompareRef = (ref: string): string => Utils.isRef(ref) ? Utils.getLocalRefspec(ref, REMOTE_NAME) : ref;

export const getFileDiff = async(file: FileResult, diffInfo: DiffInfo, dot: string): Promise<FileDiffResult> => {
  const stdout = (await command.execAsync({
    command: 'git diff',
    args: [
      `${getCompareRef(diffInfo.base)}${dot}${getCompareRef(diffInfo.head)}`,
      '--shortstat',
      '-w',
      file.file,
    ],
    cwd: Utils.getWorkspace(),
  })).stdout;

  if ('' === stdout) {
    return {insertions: 0, deletions: 0, lines: 0};
  }

  const insertions = Number.parseInt((stdout.match(/ (\d+) insertions?\(/) ?? ['', '0'])[1]);
  const deletions  = Number.parseInt((stdout.match(/ (\d+) deletions?\(/) ?? ['', '0'])[1]);
  return {insertions, deletions, lines: insertions + deletions};
};

export const getGitDiff = async(logger: Logger, context: Context): Promise<Array<DiffResult>> => {
  if (!Utils.isCloned(Utils.getWorkspace())) {
    logger.warn('Please checkout before call this action.');
    return [];
  }

  const dot       = getDot();
  const files     = getFiles();
  const prefix    = getPrefix();
  const suffix    = getSuffix();
  const workspace = getWorkspace();
  const diffInfo  = await getDiffInfo(Utils.getOctokit(), context);

  if (diffInfo.base === diffInfo.head) {
    return [];
  }

  const helper = new GitHelper(logger);
  helper.useOrigin(REMOTE_NAME);

  const refs = [Utils.normalizeRef(context.ref)];
  if (Utils.isRef(diffInfo.base)) {
    refs.push(diffInfo.base);
  }
  if (Utils.isRef(diffInfo.head)) {
    refs.push(diffInfo.head);
  }
  await helper.fetchOrigin(Utils.getWorkspace(), context, [
    '--no-tags',
    '--no-recurse-submodules',
    '--depth=10000',
  ], Utils.uniqueArray(refs).map(ref => Utils.getRefspec(ref, REMOTE_NAME)));

  return (await Utils.split((await command.execAsync({
    command: 'git diff',
    args: [
      `${getCompareRef(diffInfo.base)}${dot}${getCompareRef(diffInfo.head)}`,
      '--diff-filter=' + getFilter(),
      '--name-only',
    ],
    cwd: Utils.getWorkspace(),
    suppressError: true,
  })).stdout)
    .map(item => ({
      file: item,
      filterIgnored: isFilterIgnored(item, files),
      prefixMatched: isPrefixMatched(item, prefix),
      suffixMatched: isSuffixMatched(item, suffix),
    }))
    .filter(item => item.filterIgnored || (item.prefixMatched && item.suffixMatched))
    .map(async item => ({...item, ...await getFileDiff(item, diffInfo, dot)}))
    .reduce(async(prev, item) => {
      const acc = await prev;
      return acc.concat(await item);
    }, Promise.resolve([] as Array<DiffResult>)))
    .map(item => ({...item, file: toAbsolute(item.file, workspace)}));
};

export const getDiffFiles = (diffs: FileResult[], filter: boolean): string => escape(diffs.filter(item => !filter || item.prefixMatched && item.suffixMatched).map(item => item.file)).join(getSeparator());
export const sumResults   = (diffs: DiffResult[], map: (item: DiffResult) => number): number => getSummaryIncludeFilesFlag() ?
  diffs.map(map).reduce((acc, val) => acc + val, 0) : // eslint-disable-line no-magic-numbers
  diffs.filter(item => !item.filterIgnored).map(map).reduce((acc, val) => acc + val, 0); // eslint-disable-line no-magic-numbers

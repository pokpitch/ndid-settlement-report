const { argv } = require('yargs');
const path = require('path');
const fs = require('fs');
const mkpath = require('mkpath');
const moment = require('moment');
const config = require('./config');
const { importBlockchainQueryData } = require('./src/importBlockchainQueryData');
const { importPriceListDirectories, getPriceCategories } = require('./src/importPriceList');
const { importRpGroups } = require('./src/importRpGroups');
const { importRpPlans, importRpPlanDetails } = require('./src/importRpPlans');
const { importPreviousPendingRequests } = require('./src/importPreviousPendingRequests');
const { getNodeIdToOrgMapping } = require('./src/getNodeIdToOrgMapping');
const { mergePrevPendingReqsToCurrReqs } = require('./src/mergePrevPendingReqsToCurrReqs');
const { categorizeRequests } = require('./src/categorizeRequests');
const { calculateSettlementInfo } = require('./src/calculateSettlementInfo');
const { genCSV } = require('./src/genCSV');
const { queryNodeInfo } = require('./src/queryNodeInfo');
const { getNodeIdsFromSettlements } = require('./src/utils/requestUtil');
const { reportExecRoundDirName } = require('./src/utils/pathUtil');
const { copyReportsToWebPortalDir } = require('./src/copyReportsToWebPortalDir');
const { writeRoundFiles } = require('./src/writeRoundFiles');
const { CONFIG_HEIGHT_TIMESTAMP_FORMAT } = require('./src/utils/configUtil');

const INPUT_DATETIME_FORMAT = 'YYYYMMDDHHmmss';

let chainId;
let minHeight;
let maxHeight;
let usedTokenReportDirPath = path.resolve(__dirname, './data/GetUsedTokenReport');
let requestDetailDirPath = path.resolve(__dirname, './data/RequestDetail');
let prevPendingReqsPath = path.resolve(__dirname, './data/previousPendingRequests.json');
let pricesDirPath = path.resolve(__dirname, './data/Prices');
let groupDirPath = path.resolve(__dirname, './data/Group');
let planDirPath = path.resolve(__dirname, './data/Plan');
let planDetailDirPath = path.resolve(__dirname, './data/PlanDetail');
let argvOutputDirPath = path.resolve(__dirname, './reports');
let webPortalDirPath;


const currWorkingPath = process.cwd();
if (argv.c) {
  chainId = argv.c;
}
if (argv.b) {
  minHeight = parseInt(argv.b, 10);
}
if (argv.e) {
  maxHeight = parseInt(argv.e, 10);
}
if (argv.r) {
  usedTokenReportDirPath = path.resolve(currWorkingPath, argv.r);
}
if (argv.d) {
  requestDetailDirPath = path.resolve(currWorkingPath, argv.d);
}
if (argv.v) {
  prevPendingReqsPath = path.resolve(currWorkingPath, argv.v);
}
if (argv.p) {
  pricesDirPath = path.resolve(currWorkingPath, argv.p);
}
if (argv.g) {
  groupDirPath = path.resolve(currWorkingPath, argv.g);
}
if (argv.n) {
  planDirPath = path.resolve(currWorkingPath, argv.n);
}
if (argv.t) {
  planDetailDirPath = path.resolve(currWorkingPath, argv.t);
}
if (argv.o) {
  argvOutputDirPath = path.resolve(currWorkingPath, argv.o);
}
if (argv.w) {
  webPortalDirPath = path.resolve(currWorkingPath, argv.w);
}

const webPortalSubDirs = argv['portal-sub-dir']
  ? argv['portal-sub-dir'].split('/').filter(str => str)
  : [];
const createLatest = argv['create-latest'];

const execDatetime = moment(process.env.EXEC_DATETIME, INPUT_DATETIME_FORMAT).toDate();

const configTimestampStr = argv['config-timestamp'];
const configTimestamp = configTimestampStr
  ? moment(configTimestampStr, CONFIG_HEIGHT_TIMESTAMP_FORMAT).toDate()
  : undefined;

let billPeriod = null;
const billPeriodStartStr = argv['bill-period-start'];
const billPeriodEndStr = argv['bill-period-end'];
const billPeriodStart = billPeriodStartStr
  ? moment(billPeriodStartStr, INPUT_DATETIME_FORMAT).toDate()
  : null;
const billPeriodEnd = billPeriodEndStr
  ? moment(billPeriodEndStr, INPUT_DATETIME_FORMAT).toDate()
  : null;

if (
  billPeriodStart && !Number.isNaN(billPeriodStart.getTime()) &&
  billPeriodEnd && !Number.isNaN(billPeriodEnd.getTime())
) {
  billPeriod = {
    start: billPeriodStart,
    end: billPeriodEnd,
  };
}

const shouldCalculateNdidFee = argv['ndid-fee'] === 'true';

const enableDebugFile = argv['debug-file'];
const nodeInfoJsonFilePath = argv['node-info-json'];

let ver = 1;
if (argv.version) {
  ver = argv.version;
}

const execRoundDirName = reportExecRoundDirName({
  billPeriodStart: billPeriod.start,
  billPeriodEnd: billPeriod.end,
  minBlockHeight: minHeight,
  maxBlockHeight: maxHeight,
  version: ver,
  execDatetime,
});
const outputDirPath = path.join(argvOutputDirPath, execRoundDirName);

const nextRoundDirPath = argv['next-round'] && path.resolve(currWorkingPath, argv['next-round']);

console.log('Started generating settlement reports.');

if (nodeInfoJsonFilePath) {
  console.log(`nodeInfo.json Path: ${nodeInfoJsonFilePath}`);
}
console.log(`GetUsedTokenReport Dir: ${usedTokenReportDirPath || 'Not specific'}`);
console.log(`RequestDetail Dir: ${requestDetailDirPath || 'Not specific'}`);
console.log(`Prices Dir: ${pricesDirPath || 'Not specific'}`);
console.log(`Group Dir: ${groupDirPath || 'Not specific'}`);
console.log(`Plan Dir: ${planDirPath || 'Not specific'}`);
console.log(`pendingRequests.json Path: ${prevPendingReqsPath || 'Not specific'}`);
console.log(`Output Dir: ${outputDirPath || 'Not specific'}`);
console.log(`Web Portal Dir: ${webPortalDirPath || 'Not specific'}`);
console.log(`Web Portal Sub Dirs: ${webPortalSubDirs || 'Not specific'}`);
if (webPortalDirPath) {
  console.log(`Create Latest Dir: ${createLatest ? 'Yes' : 'No'}`);
}

console.log(`\nChain ID: ${chainId == null ? 'Not specific' : chainId}`);
console.log(`Min block height: ${minHeight == null ? 'Not specific' : minHeight}`);
console.log(`Max block height: ${maxHeight == null ? 'Not specific' : maxHeight}`);
console.log(`Bill period start: ${billPeriod && billPeriod.start ? billPeriod.start : 'Not specific'}`);
console.log(`Bill period end: ${billPeriod && billPeriod.end ? billPeriod.end : 'Not specific'}`);
console.log(`Config timestamp: ${configTimestamp || 'Not specific'}`);
console.log(`Calculate NDID fee: ${shouldCalculateNdidFee ? 'Yes' : 'No'}`);


const debugFileDirPath = path.resolve(outputDirPath, './debug');
if (enableDebugFile) {
  mkpath.sync(debugFileDirPath);
} else {
  mkpath.sync(outputDirPath);
}

// Generate report info file
fs.writeFile(
  path.join(outputDirPath, './info.txt'),
  `Execution datetime: ${moment(execDatetime).format('D-MMM-YYYY HH:mm:ss')} 
Bill period start: ${moment(billPeriod.start).format('D-MMM-YYYY HH:mm:ss')}
Bill period end: ${moment(billPeriod.end).format('D-MMM-YYYY HH:mm:ss')}
Min block height: ${minHeight}
Max block height: ${maxHeight}
`,
  (err) => {
    if (err) {
      throw err;
    }
  },
);

importPriceListDirectories(path.join(pricesDirPath, chainId))
  .then(async ({ orgs: orgInfo, prices: priceList }) => {
    const priceCategories = getPriceCategories(priceList);
    const nodeIdToOrgMapping = getNodeIdToOrgMapping(orgInfo);
    console.log('\nImporting price list succeeded.');
    if (enableDebugFile) {
      fs.writeFile(path.resolve(debugFileDirPath, './orgInfo.json'), JSON.stringify(orgInfo, null, 2), (err) => {
        if (err) {
          console.warn('Failed to write debug file: orgInfo.json', err);
        }
      });
      fs.writeFile(path.resolve(debugFileDirPath, './nodeIdToOrgMapping.json'), JSON.stringify(nodeIdToOrgMapping, null, 2), (err) => {
        if (err) {
          console.warn('Failed to write debug file: nodeIdToOrgMapping.json', err);
        }
      });
      fs.writeFile(path.resolve(debugFileDirPath, './priceList.json'), JSON.stringify(priceList, null, 2), (err) => {
        if (err) {
          console.warn('Failed to write debug file: priceList.json', err);
        }
      });
      fs.writeFile(path.resolve(debugFileDirPath, './priceCategories.json'), JSON.stringify(priceCategories, null, 2), (err) => {
        if (err) {
          console.warn('Failed to write debug file: priceCategories.json', err);
        }
      });
    }

    const rpGroups = importRpGroups(path.join(groupDirPath, chainId));
    console.log('\nImporting RP groups succeeded.');
    if (enableDebugFile) {
      fs.writeFile(path.resolve(debugFileDirPath, './rpGroups.json'), JSON.stringify(rpGroups, null, 2), (err) => {
        if (err) {
          console.warn('Failed to write debug file: rpGroups.json', err);
        }
      });
    }

    let rpPlanDetails;
    if (shouldCalculateNdidFee) {
      rpPlanDetails = importRpPlanDetails(
        path.join(planDetailDirPath, chainId),
        minHeight,
        maxHeight,
        configTimestamp,
      );
      console.log('Importing RP plan details succeeded.');
      if (enableDebugFile) {
        fs.writeFile(path.resolve(debugFileDirPath, './rpPlanDetails.json'), JSON.stringify(rpPlanDetails, null, 2), (err) => {
          if (err) {
            console.warn('Failed to write debug file: rpPlanDetails.json', err);
          }
        });
      }
    }

    let rpPlans;
    if (shouldCalculateNdidFee) {
      rpPlans =
        importRpPlans(
          planDirPath,
          rpPlanDetails,
          chainId,
          minHeight,
          maxHeight,
          configTimestamp,
          config.mktNameToWebPortalOrgDirNameMapping,
        );
      console.log('Importing RP plans succeeded.');
      if (enableDebugFile) {
        fs.writeFile(path.resolve(debugFileDirPath, './rpPlans.json'), JSON.stringify(rpPlans, null, 2), (err) => {
          if (err) {
            console.warn('Failed to write debug file: rpPlans.json', err);
          }
        });
      }
    }

    const prevPendingReqs = importPreviousPendingRequests(prevPendingReqsPath);
    console.log('Importing previous pending requests succeeded.');
    if (enableDebugFile) {
      fs.writeFile(path.resolve(debugFileDirPath, './previousPendingRequests.json'), JSON.stringify(prevPendingReqs, null, 2), (err) => {
        if (err) {
          console.warn('Failed to write debug file: previousPendingRequests.json', err);
        }
      });
    }

    const importedReqData = importBlockchainQueryData(
      usedTokenReportDirPath,
      requestDetailDirPath,
      minHeight,
      maxHeight,
    );
    console.log('Importing blockchain query data succeeded.');
    if (enableDebugFile) {
      fs.writeFile(path.resolve(debugFileDirPath, './queryDataJson.json'), JSON.stringify(importedReqData, null, 2), (err) => {
        if (err) {
          console.warn('Failed to write debug file: queryDataJson.json', err);
        }
      });
    }

    const reqData = mergePrevPendingReqsToCurrReqs(importedReqData, prevPendingReqs);
    Object.keys(reqData).forEach((reqId) => {
      if (reqData[reqId].detail == null) {
        delete reqData[reqId];
      }
    });
    console.log('Importing blockchain query data succeeded.');
    if (enableDebugFile) {
      fs.writeFile(path.resolve(debugFileDirPath, './mergedReqData.json'), JSON.stringify(reqData, null, 2), (err) => {
        if (err) {
          console.warn('Failed to write debug file: mergedReqData.json', err);
        }
      });
    }

    const categorizedReqs = categorizeRequests(reqData, nodeIdToOrgMapping, minHeight, maxHeight);
    console.log('Calculating settlement succeeded.');
    if (enableDebugFile) {
      fs.writeFile(path.resolve(debugFileDirPath, './categorizedRequests.json'), JSON.stringify(categorizedReqs, null, 2), (err) => {
        if (err) {
          console.warn('Failed to write debug file: settlement.json', err);
        }
      });
    }

    const settlementWithPrice =
      calculateSettlementInfo(categorizedReqs, priceList, rpGroups);
    console.log('Calculating price for settlement succeeded.');
    if (enableDebugFile) {
      fs.writeFile(path.resolve(debugFileDirPath, './settlementWithPrice.json'), JSON.stringify(settlementWithPrice, null, 2), (err) => {
        if (err) {
          console.warn('Failed to write debug file: settlementWithPrice.json', err);
        }
      });
    }

    let nodeInfo;
    if (nodeInfoJsonFilePath) {
      nodeInfo = JSON.parse(fs.readFileSync(nodeInfoJsonFilePath));
    } else {
      nodeInfo = await queryNodeInfo(getNodeIdsFromSettlements(Object
        .values(settlementWithPrice.finishedRequests)
        .concat(Object.values(settlementWithPrice.pendingRequests))
        .map(req => req.settlement)));
      console.log('Querying node info succeeded.');
    }
    if (enableDebugFile) {
      fs.writeFile(path.resolve(debugFileDirPath, './nodeInfo.json'), JSON.stringify(nodeInfo, null, 2), (err) => {
        if (err) {
          console.warn('Failed to write debug file: nodeInfo.json', err);
        }
      });
    }

    // Generate pending requests JSON file
    const pendingReqsJsonPath = path.join(outputDirPath, './pendingRequests.json');
    fs.writeFileSync(
      pendingReqsJsonPath,
      JSON.stringify(categorizedReqs.pendingRequests, null, 2),
      (err) => {
        if (err) {
          throw err;
        }
      },
    );
    console.log(`\npendingRequest.json created at ${outputDirPath}`);

    const outputCsvDirPath = path.join(outputDirPath, 'csv');
    await genCSV(
      settlementWithPrice,
      nodeInfo,
      orgInfo,
      priceCategories,
      rpPlans,
      rpPlanDetails,
      billPeriod,
      { min: minHeight, max: maxHeight },
      ver,
      shouldCalculateNdidFee,
      outputCsvDirPath,
    );
    console.log(`\nSettlement report (.csv) files have been created at ${outputCsvDirPath}`);

    if (webPortalDirPath) {
      await copyReportsToWebPortalDir(
        outputDirPath,
        webPortalDirPath,
        webPortalSubDirs,
        config.mktNameToWebPortalOrgDirNameMapping,
        createLatest,
      );
      console.log('Copying report files to web portal directory succeeded');
    } else {
      console.log('Copying report files to web portal directory skipped');
    }

    const thisRoundDirPath = path.join(outputDirPath, 'this-round');
    writeRoundFiles(
      chainId,
      minHeight,
      maxHeight,
      billPeriod.start,
      billPeriod.end,
      prevPendingReqsPath,
      thisRoundDirPath,
      {
        outputRoundInfoJsonFileName: 'thisRound.json',
      },
    );
    console.log('\nWriting this-round files succeeded');

    if (nextRoundDirPath) {
      writeRoundFiles(
        chainId,
        maxHeight + 1,
        null,
        billPeriod.end,
        null,
        pendingReqsJsonPath,
        nextRoundDirPath,
      );
      console.log('\nWriting next-round files succeeded');
    } else {
      console.log('\nWriting next-round files skipped');
    }

    console.log('\nGenerating settlement reports succeeded.');
  });

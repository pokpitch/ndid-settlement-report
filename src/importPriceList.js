const csv = require('csvtojson');
const fs = require('fs');
const { join } = require('path');
const _ = require('lodash');

const isDirectory = source => fs.lstatSync(source).isDirectory();
const getDirectories = source =>
  fs.readdirSync(source).map(name => join(source, name)).filter(isDirectory);

async function importPriceList(minBlockHeight, maxBlockHeight, idpPricePath, asPricePath, orgToNodeIdMapPath) {
  if (!idpPricePath || !asPricePath || !orgToNodeIdMapPath) {
    console.error('Import price list failed. Missing parameter(s).');
    return;
  }

  const idpJsonArray = await csv().fromFile(idpPricePath);
  const asJsonArray = await csv().fromFile(asPricePath);

  const mapping = JSON.parse(fs.readFileSync(orgToNodeIdMapPath, 'utf8'));

  if (!idpJsonArray || !idpJsonArray || !mapping) {
    console.error('Import price list failed. Import file(s) failed.');
    return;
  }

  const prices = {
    idp: {},
    as: {},
  };

  for (const row of idpJsonArray) {
    const orgNames = Object.keys(row).slice(2);
    const aal = row['aal'];
    const ial = row['ial'];
    
    for (const name of orgNames) {
      const idpNodeIds = mapping[name]['idp'];
      if (!idpNodeIds || idpNodeIds.length === 0) {
        continue;
      } 

      for (const nodeId of idpNodeIds) {
        if (!prices['idp'][nodeId]) {
          prices['idp'][nodeId] = {};
        }

        if (!prices['idp'][nodeId][aal]) {
          prices['idp'][nodeId][aal] = {};
        }

        prices['idp'][nodeId][aal][ial] = parseFloat(row[name]);
      }
    }
  }

  for (const row of asJsonArray) {
    const orgNames = Object.keys(row).slice(1);
    const data = row['Data'];

    for (const name of orgNames) {
      const asNodeIds = mapping[name]['as'];
      if (!asNodeIds || asNodeIds.length === 0) {
        continue;
      } 

      for (const nodeId of asNodeIds) {
        if (!prices['as'][nodeId]) {
          prices['as'][nodeId] = {};
        }

        prices['as'][nodeId][data] = parseFloat(row[name]);
      }
    }
  }

  const result = {
    min_block_height: minBlockHeight,
    max_block_height: maxBlockHeight,
    prices,
  };

  return result;
}

async function importPriceListDirectories(rootDirPath) {
  if (!rootDirPath) {
    console.error('Root directory path must be specific.');
    return;
  }

  const dirPaths = getDirectories(rootDirPath);
  const minHeights = dirPaths
    .map(dirPath => parseInt(dirPath.substring(dirPath.lastIndexOf('/') + 1), 10))
    .sort((a, b) => a - b);

  const result = [];
  for (let i = 0; i < minHeights.length; i++) {
    const minHeight = minHeights[i];
    const maxHeight = minHeights[i + 1] ? minHeights[i + 1] - 1 : undefined;
    const dirPath = join(rootDirPath, minHeight + '');

    const prices = await importPriceList(
      minHeight,
      maxHeight,
      join(dirPath, 'idp_price.csv'),
      join(dirPath, 'as_price.csv'),
      join(dirPath, 'orgToNodeIdMapping.json'),
    );

    result.push(prices);
  }

  return result;
}

function getPriceCategories(priceList) {
  const priceCatsObj = priceList
    .map((priceInfo) => {
      const { prices: { idp, as } } = priceInfo;
      const sampleIdpPrice = Object.values(idp)[0];
      const idpPriceCats = Object.keys(sampleIdpPrice).reduce(
        (catList, aal) =>
          catList.concat(Object.keys(sampleIdpPrice[aal]).map(ial => ({ ial, aal }))),
        [],
      );
      const sampleAsPrice = Object.values(as)[0];
      const asPriceCats = Object.keys(sampleAsPrice);

      return {
        idp: idpPriceCats,
        as: asPriceCats,
      };
    })
    .reduce(
      (prev, curr) => ({
        idp: _.uniqWith(prev.idp.concat(curr.idp), _.isEqual),
        as: _.uniq(prev.as.concat(curr.as)),
      }),
      { idp: [], as: [] },
    );

  priceCatsObj.idp = priceCatsObj
    .idp
    .sort((a, b) => {
      const aIal = parseFloat(a.ial);
      const bIal = parseFloat(b.ial);
      if (aIal < bIal) {
        return -1;
      }
      if (aIal > bIal) {
        return 1;
      }

      const aAal = parseFloat(a.aal);
      const bAal = parseFloat(b.aal);
      return aAal - bAal;
    });

  return priceCatsObj;
}

module.exports = {
  importPriceList,
  importPriceListDirectories,
  getPriceCategories,
};

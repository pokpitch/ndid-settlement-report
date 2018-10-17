// App code here

// const value = require('./expected1');
const Json2csvParser = require('json2csv').Parser;

const _ = require('lodash');
const fs = require('fs');
const mkpath = require('mkpath');
const { join } = require('path');

const NDID_PRICE_PER_REQ = 5;

const fieldsPending = [
  {
    label: 'RP Node ID',
    value: 'rp_id',
  }, {
    label: 'Request ID',
    value: 'request_id',
  }, {
    label: 'Request Status',
    value: 'status',
  }, {
    label: 'Created Block Height',
    value: 'height',
  }, {
    label: 'IdP Node IDs',
    value: 'idp_ids',
  }, {
    label: 'Requested IAL',
    value: 'ial',
  }, {
    label: 'Requested AAL',
    value: 'aal',
  }, {
    label: 'AS Service ID',
    value: 'service_id',
  }, {
    label: 'AS Node IDs',
    value: 'as_ids',
  },
];

const fieldsRpIdp = [
  {
    label: 'RP Node ID',
    value: 'rp_id',
  }, {
    label: 'Request ID',
    value: 'request_id',
  }, {
    label: 'Request Status',
    value: 'status',
  }, {
    label: 'Created Block Height',
    value: 'height',
  }, {
    label: 'IdP Node ID',
    value: 'idp_id',
  }, {
    label: 'Requested IAL',
    value: 'ial',
  }, {
    label: 'Requested AAL',
    value: 'aal',
  }, {
    label: 'IdP Response',
    value: 'response',
  }, {
    label: 'IdP Price',
    value: 'price',
  }, {
    label: 'IdP Full Price',
    value: 'full_price',
  },
];
const fieldsRpIdpSummary = [
  {
    label: 'RP Node ID',
    value: 'rpId',
  }, {
    label: 'IdP Node ID',
    value: 'idpId',
  }, {
    label: 'IdP Price',
    value: 'idpPrice',
  },
];

const fieldsRpAs = [
  {
    label: 'RP Node ID',
    value: 'rp_id',
  }, {
    label: 'Request ID',
    value: 'request_id',
  }, {
    label: 'Request Status',
    value: 'status',
  }, {
    label: 'Created Block Height',
    value: 'height',
  }, {
    label: 'AS Node ID',
    value: 'as_id',
  }, {
    label: 'AS Service ID',
    value: 'service_id',
  }, {
    label: 'AS Price',
    value: 'price',
  },
];
const fieldsRpAsSummary = [
  {
    label: 'RP Node ID',
    value: 'rpId',
  }, {
    label: 'AS Node ID',
    value: 'asId',
  }, {
    label: 'AS Service ID',
    value: 'serviceId',
  }, {
    label: 'AS Price',
    value: 'asPrice',
  },
];

const fieldsRpNdid = [
  {
    label: 'RP Node ID',
    value: 'rp_id',
  }, {
    label: 'Request ID',
    value: 'request_id',
  }, {
    label: 'Request Status',
    value: 'status',
  }, {
    label: 'Created Block Height',
    value: 'height',
  }, {
    label: 'NDID Price',
    value: 'price',
  },
];
const fieldsRpNdidSummary = [
  {
    label: 'RP Node ID',
    value: 'rpId',
  }, {
    label: 'NDID Price',
    value: 'ndidPrice',
  },
];

const pendingParser = new Json2csvParser({ fields: fieldsPending });

const rpIdpParser = new Json2csvParser({ fields: fieldsRpIdp });
const rpIdpSumParser = new Json2csvParser({ fields: fieldsRpIdpSummary });

const rpAsParser = new Json2csvParser({ fields: fieldsRpAs });
const rpAsSumParser = new Json2csvParser({ fields: fieldsRpAsSummary });

const rpNdidParser = new Json2csvParser({ fields: fieldsRpNdid });
const rpNdidSumParser = new Json2csvParser({ fields: fieldsRpNdidSummary });

function genRowsFromPendingRequest(req) {
  const { detail, settlement } = req;

  const rows = (detail.data_request_list.length > 0 ? detail.data_request_list : [{}])
    .map(({ as_id_list = [], service_id = '' }) => ({
      rp_id: settlement.requester_node_id,
      request_id: settlement.request_id,
      status: settlement.status,
      height: settlement.height,
      idp_ids: detail.idp_id_list.join(', '),
      ial: detail.min_ial,
      aal: detail.min_aal,
      service_id,
      as_ids: as_id_list.join(', '),
    }));

  return rows;
}

function genRowsFromRequest(req) {
  const { settlement } = req;

  const rpIdp = [];
  settlement.idpList.forEach((item) => {
    const request = {};
    request.rp_id = settlement.requester_node_id;
    request.request_id = settlement.request_id;
    request.status = settlement.status;
    request.height = settlement.height;
    request.idp_id = item.idp_id;
    request.ial = item.ial;
    request.aal = item.aal;
    request.response = item.status;
    request.price = _.round(item.idp_price, 6);
    request.full_price = _.round(item.idp_full_price, 6);

    rpIdp.push(request);
  });

  const rpAs = [];
  settlement.asList.forEach((item) => {
    const request = {};
    request.rp_id = settlement.requester_node_id;
    request.request_id = settlement.request_id;
    request.status = settlement.status;
    request.height = settlement.height;
    request.as_id = item.as_id;
    request.service_id = item.service_id;
    request.price = _.round(item.as_price, 6);

    rpAs.push(request);
  });

  const rpNdid = [{
    rp_id: settlement.requester_node_id,
    request_id: settlement.request_id,
    status: settlement.status,
    height: settlement.height,
    price: NDID_PRICE_PER_REQ,
  }];

  return {
    rpIdp,
    rpAs,
    rpNdid,
  };
}

function getNodeList(allRows) {
  const rpList = [];
  const idpList = [];
  const asList = [];
  allRows.rpIdp.forEach((item) => {
    if (!rpList.includes(item.rp_id)) {
      rpList.push(item.rp_id);
    }
    if (!idpList.includes(item.idp_id)) {
      idpList.push(item.idp_id);
    }
  });
  allRows.rpAs.forEach((item) => {
    if (!asList.includes(item.as_id)) {
      asList.push(item.as_id);
    }
  });
  return {
    rpList,
    idpList,
    asList,
  };
}

function createFile(csv, filePathInOutputDir, outputDirPath) {
  const filePath = join(outputDirPath, filePathInOutputDir);
  mkpath.sync(filePath.substring(0, filePath.lastIndexOf('/')));
  fs.writeFile(filePath, csv, (err) => {
    if (err) throw err;
  });
}

function genSummaryRpIdp(path, requests, nodeIdList, outputDirPath) {
  const summary = [];
  nodeIdList.forEach((id) => {
    const filter = requests.filter(item => item.idp_id === id);
    const sum = filter.reduce((prev, curr) => ({
      rpId: curr.rp_id,
      idpId: curr.idp_id,
      idpPrice: prev.idpPrice + curr.price,
    }), {
      idpPrice: 0,
    });
    sum.idpPrice = _.round(sum.idpPrice, 6);
    summary.push(sum);
  });
  const sumCsv = rpIdpSumParser.parse(summary);
  createFile(sumCsv, path, outputDirPath);
}

function genSummaryRpAs(path, requests, checkDataList, checkRp, outputDirPath) {
  const summary = [];
  checkDataList.forEach((checkData) => {
    const filter = requests.filter((item) => {
      if (checkRp) {
        return checkData.rpId === item.rp_id && checkData.serviceId === item.service_id;
      }
      return checkData.asId === item.as_id && checkData.serviceId === item.service_id;
    });
    const sumRpAs = filter.reduce((prev, curr) => ({
      rpId: curr.rp_id,
      asId: curr.as_id,
      serviceId: curr.service_id,
      asPrice: prev.asPrice + curr.price,
    }), {
      asPrice: 0,
    });
    sumRpAs.asPrice = _.round(sumRpAs.asPrice, 6);
    summary.push(sumRpAs);
  });
  const sumCsv = rpAsSumParser.parse(summary);
  createFile(sumCsv, path, outputDirPath);
}

function genSummaryRpNdid(path, requests, rpId, outputDirPath) {
  const summary = [
    requests
      .filter(req => req.rp_id === rpId)
      .reduce((prev, curr) => ({
        rpId: curr.rp_id,
        ndidPrice: prev.ndidPrice + curr.price,
      }), {
        ndidPrice: 0,
      }),
  ].map(item => ({ ...item, ndidPrice: _.round(item.ndidPrice, 6) }));

  const sumCsv = rpNdidSumParser.parse(summary);
  createFile(sumCsv, path, outputDirPath);
}

function genCSV(settlementWithPrice, pendingRequests, outputDirPath) {
  const allPendingReqIds = Object.keys(pendingRequests);
  const allPendingReqRows = allPendingReqIds
    .map(reqId => genRowsFromPendingRequest(pendingRequests[reqId]))
    .reduce((prev, curr) => prev.concat(curr), []);
  createFile(pendingParser.parse(allPendingReqRows), 'csv/pending.csv', outputDirPath);

  const allReqIds = Object.keys(settlementWithPrice);
  const allRows = allReqIds
    .map(reqId => genRowsFromRequest(settlementWithPrice[reqId]))
    .reduce((prev, curr) => ({
      rpIdp: prev.rpIdp.concat(curr.rpIdp),
      rpAs: prev.rpAs.concat(curr.rpAs),
      rpNdid: prev.rpNdid.concat(curr.rpNdid),
    }), {
      rpIdp: [],
      rpAs: [],
      rpNdid: [],
    });
  const nodeList = getNodeList(allRows);

  nodeList.rpList.forEach((id) => {
    const rpIdp = [];
    allRows.rpIdp.forEach((row) => {
      if (id === row.rp_id) {
        rpIdp.push(row);
      }
    });
    const csv = rpIdpParser.parse(rpIdp);
    createFile(csv, `csv/rp-idp/${id}.csv`, outputDirPath);

    const idp = [];
    rpIdp.forEach((item) => {
      if (!idp.includes(item.idp_id)) {
        idp.push(item.idp_id);
      }
    });
    genSummaryRpIdp(`csv/rp-idp-summary/${id}.csv`, rpIdp, idp, outputDirPath);

    const rpNdidCsv = rpNdidParser.parse(allRows.rpNdid.filter(row => id === row.rp_id));
    createFile(rpNdidCsv, `csv/rp-ndid/${id}.csv`, outputDirPath);

    genSummaryRpNdid(`csv/rp-ndid-summary/${id}.csv`, allRows.rpNdid, id, outputDirPath);
  });

  nodeList.idpList.forEach((id) => {
    const idpRp = [];
    allRows.rpIdp.forEach((row) => {
      if (id === row.idp_id) {
        idpRp.push(row);
      }
    });
    const csv = rpIdpParser.parse(idpRp);
    createFile(csv, `csv/idp-rp/${id}.csv`, outputDirPath);

    const rp = [];
    idpRp.forEach((item) => {
      if (!rp.includes(item.idp_id)) {
        rp.push(item.idp_id);
      }
    });
    genSummaryRpIdp(`csv/idp-rp-summary/${id}.csv`, idpRp, rp, outputDirPath);
  });

  nodeList.rpList.forEach((id) => {
    const rpAs = [];
    allRows.rpAs.forEach((row) => {
      if (id === row.rp_id) {
        rpAs.push(row);
      }
    });
    const csv = rpAsParser.parse(rpAs);
    createFile(csv, `csv/rp-as/${id}.csv`, outputDirPath);

    const asList = [];
    rpAs.forEach((item) => {
      const as = {
        asId: item.as_id,
        serviceId: item.service_id,
      };
      if ((asList.findIndex(data => JSON.stringify(data) === JSON.stringify(as))) === -1) {
        asList.push(as);
      }
    });
    genSummaryRpAs(`csv/rp-as-summary/${id}.csv`, rpAs, asList, false, outputDirPath);
  });

  nodeList.asList.forEach((id) => {
    const asRp = [];
    allRows.rpAs.forEach((row) => {
      if (id === row.as_id) {
        asRp.push(row);
      }
    });
    const csv = rpAsParser.parse(asRp);
    createFile(csv, `csv/as-rp/${id}.csv`, outputDirPath);

    const asList = [];
    asRp.forEach((item) => {
      const as = {
        rpId: item.rp_id,
        serviceId: item.service_id,
      };
      if ((asList.findIndex(data => JSON.stringify(data) === JSON.stringify(as))) === -1) {
        asList.push(as);
      }
    });
    genSummaryRpAs(`csv/as-rp-summary/${id}.csv`, asRp, asList, true, outputDirPath);
  });
}

module.exports.genCSV = genCSV;

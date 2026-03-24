const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME;
const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY;

const WATCHLIST = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"];

function roundToTwo(num) {
  return Math.round(num * 100) / 100;
}

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function getStartDate(daysBack = 14) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return formatDate(d);
}

function getEndDate() {
  return formatDate(new Date());
}

async function fetchDailySeries(symbol) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 14);

  const from = start.toISOString().split("T")[0];
  const to = end.toISOString().split("T")[0];

  const url =
    `https://api.massive.com/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}` +
    `?adjusted=true&sort=desc&limit=20&apiKey=${MASSIVE_API_KEY}`;

  console.log(`Fetching daily data for ${symbol}: ${url}`);

  const response = await fetch(url);
  const data = await response.json();

  console.log(`Massive response for ${symbol}:`, JSON.stringify(data, null, 2));

  if (!response.ok) {
    throw new Error(`Massive request failed for ${symbol}: ${response.status}`);
  }

  if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
    throw new Error(`No daily data returned for ${symbol}`);
  }

  const series = {};

  for (const bar of data.results) {
    const date = new Date(bar.t).toISOString().split("T")[0];
    series[date] = {
      "1. open": String(bar.o),
      "4. close": String(bar.c),
    };
  }

  return series;
}

function buildDailyWinners(seriesBySymbol) {
  const allDates = new Set();

  for (const symbol of Object.keys(seriesBySymbol)) {
    for (const date of Object.keys(seriesBySymbol[symbol])) {
      allDates.add(date);
    }
  }

  const sortedDates = Array.from(allDates).sort(
    (a, b) => new Date(b) - new Date(a)
  );

  const latestSevenDates = sortedDates.slice(0, 7);

  const winners = [];

  for (const date of latestSevenDates) {
    let winner = null;

    for (const symbol of WATCHLIST) {
      const daily = seriesBySymbol[symbol]?.[date];
      if (!daily) continue;

      const open = Number(daily["1. open"]);
      const close = Number(daily["4. close"]);

      if (!open || Number.isNaN(open) || Number.isNaN(close)) continue;

      const percentChange = ((close - open) / open) * 100;
      const absChange = Math.abs(percentChange);

      const candidate = {
        date,
        ticker: symbol,
        percent_change: roundToTwo(percentChange),
        close_price: roundToTwo(close),
        _abs_change: absChange,
      };

      if (!winner || candidate._abs_change > winner._abs_change) {
        winner = candidate;
      }
    }

    if (winner) {
      delete winner._abs_change;
      winners.push(winner);
    }
  }

  return winners.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function dedupeByDateKeepLargestMove(items) {
  const byDate = new Map();

  for (const item of items) {
    const current = byDate.get(item.date);
    const currentAbs = current ? Math.abs(Number(current.percent_change || 0)) : -1;
    const nextAbs = Math.abs(Number(item.percent_change || 0));

    if (!current || nextAbs > currentAbs) {
      byDate.set(item.date, item);
    }
  }

  return Array.from(byDate.values()).sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
}

module.exports.getMovers = async () => {
  try {
    const result = await dynamodb
      .scan({
        TableName: TABLE_NAME,
      })
      .promise();

    const items = result.Items || [];

    const deduped = dedupeByDateKeepLargestMove(items);

    const latestSeven = deduped
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 7)
      .reverse();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(latestSeven),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "failed to fetch movers",
        details: error.message,
      }),
    };
  }
};

module.exports.ingestMovers = async () => {
  try {
    if (!MASSIVE_API_KEY) {
      throw new Error("Missing MASSIVE_API_KEY environment variable");
    }

    const seriesBySymbol = {};

    for (const symbol of WATCHLIST) {
    seriesBySymbol[symbol] = await fetchDailySeries(symbol);
    }

    const winners = buildDailyWinners(seriesBySymbol);

    if (!winners.length) {
      throw new Error("No winners could be calculated from Massive data");
    }

    for (const item of winners) {
      await dynamodb
        .put({
          TableName: TABLE_NAME,
          Item: item,
        })
        .promise();
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "ingest complete",
        records_written: winners.length,
        winners,
      }),
    };
  } catch (error) {
    console.error("INGEST ERROR:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "ingest failed",
        details: error.message,
      }),
    };
  }
};
# Stock Movers Serverless Dashboard

A serverless stock analytics project that tracks the top daily movers from a 5-stock watchlist, stores results in DynamoDB, and displays them in a live frontend dashboard and table view.

## Project Overview

This project uses a serverless backend on AWS to fetch recent stock data, identify the biggest mover for each day, store the results in DynamoDB, and expose the data through an API endpoint for a static frontend.

The frontend displays:
- a dashboard with summary cards and a percent-change chart
- a table view with the most recent 7 daily movers
- color-coded gains and losses

## Architecture

The project is built with these components:

- **AWS Lambda**
  - `ingestMovers`: fetches stock data, computes the largest daily mover, and stores results in DynamoDB
  - `getMovers`: reads stored mover data and returns it through the API

- **Amazon DynamoDB**
  - stores daily stock mover records

- **API Gateway**
  - exposes the `/movers` endpoint for the frontend

- **EventBridge**
  - runs the ingestion Lambda on a schedule

- **Static Frontend**
  - built from the SB Admin 2 template
  - hosted as static files
  - connected to the live API

## Current Watchlist

The current watchlist includes 5 stocks:

- AAPL
- MSFT
- GOOGL
- AMZN
- TSLA

## How It Works

1. The scheduled ingestion function requests recent daily stock data for the watchlist.
2. For each trading day, the backend calculates the percent change using:
   ```text
   (close - open) / open * 100
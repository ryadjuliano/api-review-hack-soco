# API Review Hack

Express API server for review analysis.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file in the root directory with the following content:
   ```
   PORT=3000
   NODE_ENV=development
   ```

## Running the Server

Development mode (with auto-restart):
```
npm run dev
```

Production mode:
```
npm start
```

## API Endpoints

### GET /api/reviews/matching-percentage
Returns matching percentage information for reviews.

### GET /api/reviews/analyze
Returns analysis for reviews.

## Example Response

```json
{
  "success": true,
  "message": "Endpoint message",
  "data": {
    // Response data here
  }
}
```

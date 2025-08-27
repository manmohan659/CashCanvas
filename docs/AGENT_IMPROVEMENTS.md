# LLM Agent Improvements

## Overview
The CashCanvas LLM agent has been significantly enhanced with agentic capabilities to provide intelligent database querying and analysis. The agent can now understand complex queries about trips, locations, and spending patterns.

## Key Improvements

### 1. Enhanced LLM Configuration
- **Multi-vendor support**: Works with OpenAI (function calling) and Gemini (heuristic analysis)
- **Better error handling**: Improved retry logic for rate limits and network errors
- **Fallback mechanisms**: Smart heuristic analysis when LLM is unavailable

### 2. New Agentic Tools

#### `analyze_location_spend`
- **Purpose**: Analyze spending for specific locations
- **Keywords detected**: NY, NYC, New York, Manhattan, Brooklyn, etc.
- **Features**: Monthly breakdowns, location-based filtering, comprehensive summaries

#### `analyze_trip_spend`
- **Purpose**: Detect and analyze travel-related expenses
- **Categories included**: Flights, Hotels, Transportation, Airbnb, Uber, Lyft, etc.
- **Keywords detected**: flight, hotel, airport, travel, trip, vacation, etc.

#### `monthly_spend_trend`
- **Purpose**: Show income vs spending trends over time
- **Features**: Configurable time periods, net calculations

#### `category_deep_dive`
- **Purpose**: Detailed analysis within specific spending categories
- **Features**: Monthly patterns, averages, recent transactions

### 3. Smart Query Detection
The agent automatically detects query types:

- **Location queries** → `analyze_location_spend`
- **Trip/travel questions** → `analyze_trip_spend`
- **Trend analysis** → `monthly_spend_trend`
- **Category analysis** → `category_deep_dive`
- **General queries** → Enhanced heuristic analysis

### 4. Enhanced Heuristic Analysis
For non-OpenAI models, the agent uses sophisticated pattern matching:
- Location keyword detection in transaction descriptions
- Travel category and keyword identification
- Improved formatting with tables and summaries
- Date range support where applicable

## Example Queries

### Location-Based Queries
```
"How much did I spend in NY?"
"NYC trip expenses"
"New York spending"
```

### Trip Analysis
```
"How much did I spend on trips?"
"Travel expenses this year"
"My vacation costs"
```

### Category Analysis
```
"Coffee spending patterns"
"Monthly grocery trends"
"Dining out analysis"
```

## Technical Implementation

### Database Integration
- Direct SQL queries with user isolation
- Full-text search capabilities
- Efficient indexing for performance
- Safe parameterized queries

### Error Handling
- Tool-level error isolation
- API retry with exponential backoff
- Graceful fallback to heuristic analysis
- Comprehensive logging for debugging

### Response Formatting
- Structured Markdown output
- Tables for transaction listings
- Monthly breakdowns and summaries
- Clear tips and recommendations

## Usage

1. **Configure LLM**: Set up OpenAI or Gemini API key in LLM Settings
2. **Ask questions**: Use natural language queries about spending
3. **Get insights**: Receive formatted analysis with tables and summaries

## Future Enhancements

- Integration with calendar data for trip detection
- Machine learning for better categorization
- Visual chart generation for trends
- Multi-currency support
- Advanced date range parsing

## Testing

Run the test suite to verify agent functionality:
```bash
npm test -- agent.test.ts
```

The agent is now truly agentic - it can query your database, analyze patterns, and provide intelligent insights about your spending behavior!

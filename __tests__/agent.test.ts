// Test file to demonstrate agent capabilities
import { runFinanceAgent } from '../lib/agent/agent';
import { saveLLMConfig } from '../lib/agent/llm';

// Mock LLM config for testing
saveLLMConfig({
  vendor: 'openai',
  apiKey: process.env.OPENAI_API_KEY || 'test-key',
  model: 'gpt-4o-mini'
});

describe('Finance Agent', () => {
  test('should handle NY trip queries', async () => {
    const response = await runFinanceAgent('How much did I spend on my NY trip?');
    console.log('NY Trip Response:', response);
    expect(response).toContain('Location-Based Spending Analysis');
  });

  test('should handle general trip queries', async () => {
    const response = await runFinanceAgent('How much did I spend on trips?');
    console.log('Trip Response:', response);
    expect(response).toContain('Trip & Travel Spending Analysis');
  });

  test('should handle location queries', async () => {
    const response = await runFinanceAgent('NYC expenses');
    console.log('Location Response:', response);
    expect(response).toContain('Location-Based Spending Analysis');
  });

  test('should handle general spending queries', async () => {
    const response = await runFinanceAgent('How much did I spend on coffee?');
    console.log('General Spending Response:', response);
    expect(response).toContain('Spending Analysis');
  });
});

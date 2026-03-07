import { describe, expect, it } from 'vitest';
import { findSimilarTokens } from '../src/transformer-errors.js';

describe('findSimilarTokens', () => {
  it('should find close matches with small edits', () => {
    const result = findSimilarTokens('UserServce', [
      'UserService',
      'ProductService',
      'OrderService',
    ]);
    expect(result).toContain('UserService');
  });

  it('should find prefix matches', () => {
    const result = findSimilarTokens('UserRepo', [
      'UserRepos',
      'ProductRepo',
      'OrderService',
    ]);
    expect(result).toContain('UserRepos');
  });

  it('should return empty for no close matches', () => {
    const result = findSimilarTokens('Foo', [
      'CompletelyDifferent',
      'AlsoUnrelated',
    ]);
    expect(result).toEqual([]);
  });

  it('should be case-insensitive', () => {
    const result = findSimilarTokens('UserServce', [
      'userservice',
      'ProductService',
    ]);
    expect(result).toContain('userservice');
  });

  it('should return at most maxResults', () => {
    const result = findSimilarTokens(
      'Svc',
      ['Sv', 'Svx', 'Svz', 'Svy', 'Svw'],
      2,
    );
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('should not return exact matches', () => {
    const result = findSimilarTokens('Foo', ['Foo', 'Fo', 'Fooo']);
    expect(result).not.toContain('Foo');
  });
});

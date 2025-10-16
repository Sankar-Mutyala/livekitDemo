import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

// make this file an ES module so TypeScript's `--isolatedModules` accepts it
export {};

test('renders learn react link', () => {
	const { getByText } = render(<App />);
	const linkElement = getByText(/learn react/i);
	expect(linkElement).toBeInTheDocument();
});

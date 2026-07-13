// Generates one flat GitHub-style contribution heatmap SVG per calendar year.
// Unlike the lowlighter/metrics isocalendar plugin (which only supports a
// rolling "half-year" or "full-year" window), this hits the GraphQL API's
// contributionsCollection(from, to) directly so we can pin exact Jan 1 - Dec 31
// ranges, giving a true "switch between years" experience via <details> blocks
// in the README (GitHub strips <script>, so this is the static equivalent).
import { graphql } from '@octokit/graphql';
import fs from 'node:fs';

const token = process.env.GITHUB_TOKEN;
const username = process.env.GH_USERNAME || 'MettaSurendhar';
const years = (process.env.YEARS || '2023,2024,2025,2026')
	.split(',')
	.map((y) => Number(y.trim()));

if (!token) {
	console.error('GITHUB_TOKEN env var is required');
	process.exit(1);
}

const gql = graphql.defaults({ headers: { authorization: `token ${token}` } });

const COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];

function levelFor(count, max) {
	if (count === 0) return 0;
	const ratio = count / Math.max(max, 1);
	if (ratio > 0.75) return 4;
	if (ratio > 0.5) return 3;
	if (ratio > 0.25) return 2;
	return 1;
}

async function fetchYear(year) {
	const from = `${year}-01-01T00:00:00Z`;
	const to = `${year}-12-31T23:59:59Z`;
	const query = `
    query ($username: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $username) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }`;
	const result = await gql(query, { username, from, to });
	return result.user.contributionsCollection.contributionCalendar;
}

function renderSVG(calendar, year) {
	const cell = 11;
	const gap = 3;
	const step = cell + gap;
	const weeks = calendar.weeks;
	const width = weeks.length * step + 20;
	const height = 7 * step + 34;
	const max = Math.max(
		1,
		...weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)),
	);

	let rects = '';
	weeks.forEach((week, wi) => {
		week.contributionDays.forEach((day, di) => {
			const x = 10 + wi * step;
			const y = 24 + di * step;
			const level = levelFor(day.contributionCount, max);
			rects += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" ry="2" fill="${COLORS[level]}"><title>${day.date}: ${day.contributionCount} contribution(s)</title></rect>\n`;
		});
	});

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'Segoe UI', Helvetica, Arial, sans-serif">
  <rect width="${width}" height="${height}" fill="transparent"/>
  <text x="10" y="15" font-size="12" font-weight="600" fill="#57606a">${year} · ${calendar.totalContributions} contributions</text>
  ${rects}
</svg>`;
}

const outDir = 'calendars';
fs.mkdirSync(outDir, { recursive: true });

for (const year of years) {
	try {
		const calendar = await fetchYear(year);
		const svg = renderSVG(calendar, year);
		fs.writeFileSync(`${outDir}/${year}.svg`, svg);
		console.log(
			`wrote ${outDir}/${year}.svg (${calendar.totalContributions} contributions)`,
		);
	} catch (err) {
		console.error(`failed to render ${year}:`, err.message);
	}
}

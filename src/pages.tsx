import type { FC } from "hono/jsx";

const Layout: FC = ({ children }) => {
	return (
		<html lang="ja">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>ポケットサインターネット　お申し込みページ</title>
			</head>
			<body>
				<main>{children}</main>
			</body>
		</html>
	);
};

export const Index: FC = () => {
	return (
		<Layout>
			<h1>ポケットサインターネット　お申し込み</h1>
			<p>お申し込みはこちらから</p>
			<form action="/apply" method="post">
				<select name="plan">
					<option value="高速プラン">高速プラン</option>
					<option value="中速プラン">中速プラン</option>
					<option value="低速プラン">低速プラン</option>
				</select>
				<br />
				<input type="submit" value="申し込む" />
			</form>
		</Layout>
	);
};

export const Callback: FC<{ content: string }> = ({ content }) => {
	return (
		<Layout>
			<h1>ポケットサインターネット　お申し込み完了</h1>
			<p>{content}</p>
		</Layout>
	);
};

export const Error: FC<{ message: string }> = ({ message }) => {
	return (
		<Layout>
			<h1>エラー</h1>
			<pre>{message}</pre>
		</Layout>
	);
};

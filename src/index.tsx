import { SessionService } from "@buf/pocketsign_apis.connectrpc_es/pocketsign/stamp/v1/session_connect";
import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { Callback, Error, Index } from "./pages";

const client = createPromiseClient(
	SessionService,
	createConnectTransport({
		baseUrl: "https://verify.mock.p8n.app",
		useBinaryFormat: true,

		// Cloudflare Workersで動作させるためのWorkaroundです。（通常は不要）
		fetch: (input, init) =>
			fetch(input, {
				method: init?.method,
				headers: init?.headers,
				body: init?.body,
			}),
	}),
);

const app = new Hono();

app.get("/", c => {
	return c.html(<Index />);
});

app.post("/apply", async c => {
	const { plan } = await c.req.parseBody();

	const url = new URL(c.req.url);

	// ランダムかつ再利用不可能な文字列 `nonce` を生成します。
	const nonce = crypto.randomUUID();

	// 公的個人認証サービス(JPKI)より発行された署名用電子証明書を用いた署名や、最新４情報の取得を行うための同意について、利用者に要求を行うためのセッションを作成します。
	const resp = await client.createSession(
		{
			// セッションが完了した際に利用者がコールバックされるべきURLを指定します。
			// コールバックリクエストはGETリクエストとして送信され、署名セッションIDがクエリパラメータ `session_id` として追加されます。
			callbackUrl: `${url.origin}/callback`,
			requests: [
				{
					required: true,
					request: {
						case: "digitalSignature",
						value: {
							content: new TextEncoder().encode(
								`【申込書】\n利用規約に同意し、選択したプランに申し込みます。\nプラン: ${plan}`,
							),
							printableContent: `ポケットサインターネットにお申し込みいただきありがとうございます。申込内容は以下のとおりです。\n\nプラン: ${plan}`,
						},
					},
				},
				{
					required: false,
					request: {
						case: "personalInfoConsent",
						value: {
							preference: {
								address: true,
								commonName: true,
								dateOfBirth: true,
								gender: true,
							},
						},
					},
				},
			],
			// この値は、セッションがFinalizeされるまでPocketSign Stampが保持します。
			// ここでは、ランダムかつ再利用不可能な文字列 `nonce` を指定しています。
			metadata: { nonce },
		},
		{
			headers: {
				Authorization: `Bearer ${c.env?.POCKETSIGN_TOKEN}`,
			},
		},
	);

	// ユーザーのブラウザセッションと紐づけて `nonce` を保存します。
	setCookie(c, "nonce", nonce);

	// Stamp Webサイトへリダイレクトします。
	return c.redirect(resp.redirectUrl);
});

// Stamp Webサイトからのコールバックリクエストを受け取るエンドポイントです。
app.get("/callback", async c => {
	try {
		// セッションを終了し、結果を取得します。
		const resp = await client.finalizeSession(
			{
				// クエリパラメータ `session_id` として追加された署名セッションIDを指定します。
				id: c.req.query("session_id"),
			},
			{
				headers: {
					Authorization: `Bearer ${c.env?.POCKETSIGN_TOKEN}`,
				},
			},
		);

		// ユーザーのブラウザセッションと紐づけて保存していた `nonce` と APIレスポンスの `metadata.nonce` を比較します。
		// 一致しない場合、当該書面やそれに関連するデータは不正に作成された可能性があります。
		if (getCookie(c, "nonce") !== resp.metadata.nonce) {
			return c.html(<Error message={"不正なリダイレクトを検知しました。"} />);
		}

		const content = resp.results
			.map(({ result }) => {
				if (result.case === "digitalSignature") {
					const content = result.value.result?.certificateContent?.typeSpecificContent;
					if (content?.case === "jpkiCardDigitalSignatureContent") {
						return `${content.value.commonName} 様、お申し込みありがとうございました。ご自宅（${content.value.address}）に契約書をお送りします。`;
					}
					return `お申し込みが確認できませんでした。`;
				}
				// 最新4情報の提供への同意を required: false としていたため、同意が得られない場合があり、その場合resultsに含まれません。
				if (result.case === "personalInfoConsent") {
					return `また、最新4情報の提供に同意いただきありがとうございます。同意は ${result.value.result?.expiresAt
						?.toDate()
						.toLocaleString()} まで有効です。`;
				}
			})
			.join("\n");

		return c.html(<Callback content={content} />);
	} catch (e) {
		return c.html(<Error message={`エラーが発生しました\n\n${JSON.stringify(e, undefined, 2)}`} />);
	}
});

export default app;

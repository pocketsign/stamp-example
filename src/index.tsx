import { SessionService } from "@buf/pocketsign_apis.connectrpc_es/pocketsign/stamp/v1/session_connect";
import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { Callback, Error, Index } from "./pages";
import { Verification_Result } from "@buf/pocketsign_apis.bufbuild_es/pocketsign/verify/v2/types_pb";

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
	const nonce = crypto.randomUUID();
	const resp = await client.createSession(
		{
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
			metadata: { nonce },
		},
		{
			headers: {
				Authorization: `Bearer ${c.env?.POCKETSIGN_TOKEN}`,
			},
		},
	);

	setCookie(c, "nonce", nonce);
	return c.redirect(resp.redirectUrl);
});

app.get("/callback", async c => {
	try {
		const resp = await client.finalizeSession(
			{
				id: c.req.query("session_id"),
			},
			{
				headers: {
					Authorization: `Bearer ${c.env?.POCKETSIGN_TOKEN}`,
				},
			},
		);

		if (getCookie(c, "nonce") !== resp.metadata.nonce) {
			return c.html(<Error message={"不正なリダイレクトを検知しました。"} />);
		}

		const content = resp.results
			.map(({ result }) => {
				if (result.case === "digitalSignature") {
					if (result.value.response.case === "result") {
						if (result.value.response.value.verification?.result === Verification_Result.OK) {
							const content = result.value.response.value.certificateContent?.typeSpecificContent;
							if (content?.case === "jpkiCardDigitalSignatureContent") {
								return `${content.value.commonName} 様、お申し込みありがとうございました。ご自宅（${content.value.address}）に契約書をお送りします。`;
							}
						} else {
							return `本人確認に失敗しました。理由：${
								{
									[Verification_Result.SIGNATURE_MISMATCH]: "署名が一致しませんでした",
									[Verification_Result.CERTIFICATE_REVOKED]: "証明書が失効しています",
									[Verification_Result.CERTIFICATE_EXPIRED]: "証明書が期限切れです",
									[Verification_Result.UNSPECIFIED]: "不明なエラーが発生しました",
								}[
									result.value.response.value.verification?.result ??
										Verification_Result.UNSPECIFIED
								]
							}。`;
						}
					} else {
						return `お申し込みが確認できませんでした。理由：${result.value.response.value?.message}`;
					}
				}
				if (result.case === "personalInfoConsent") {
					if (result.value.response.case === "result") {
						return `また、最新4情報の提供に同意いただきありがとうございます。同意は ${result.value.response.value.expiresAt
							?.toDate()
							.toLocaleString()} まで有効です。`;
					} else {
						return `最新4情報の提供の同意が確認できませんでした。理由：${result.value.response.value?.message}`;
					}
				}
			})
			.join("\n");

		return c.html(<Callback content={content} />);
	} catch (e) {
		return c.html(<Error message={`エラーが発生しました\n\n${JSON.stringify(e, undefined, 2)}`} />);
	}
});

export default app;

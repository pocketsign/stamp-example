import { ErrorInfo } from "@buf/googleapis_googleapis.bufbuild_es/google/rpc/error_details_pb";
import { SessionService } from "@buf/pocketsign_apis.connectrpc_es/pocketsign/stamp/v1/session_connect";
import { ConnectError, createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { Callback, Error, Index } from "./pages";
import { Verification_Result } from "@buf/pocketsign_apis.bufbuild_es/pocketsign/verify/v2/types_pb";
import { getStampErrorMessage, getVerifyErrorMessage } from "./error";
import { Timestamp } from "@bufbuild/protobuf";

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

	// 公的個人認証サービス(JPKI)より発行された署名用電子証明書を用いた署名や、最新の基本４情報取得についての同意について、利用者に要求を行うためのセッションを作成します。
	const resp = await client.createSession(
		{
			// 署名が完了した後に利用者がコールバックされるべき URL（コールバック URL）を指定します。
			// コールバックリクエストはGETリクエストとして送信され、署名セッションIDがクエリパラメータ `session_id` として追加されます。
			callbackUrl: `${url.origin}/callback`,
			// 申込情報への署名要求、最新４情報取得についての同意要求を指定します。
			requests: [
				{
					// trueを設定した場合は、利用者がこの要求をスキップできなくなります。
					required: true,
					request: {
						// 公的個人認証サービス(JPKI)より発行された署名用電子証明書による署名の作成を要求します。
						case: "digitalSignature",
						value: {
							// 署名対象となるデータを指定します。
							content: new TextEncoder().encode(
								`【申込書】\n利用規約に同意し、選択したプランに申し込みます。\nプラン: ${plan}`,
							),
							// この値は、ユーザーに何を署名させようとしているのかを示すために利用されます。
							// Markdown形式（CommonMark）で記述された文字列を指定することができます。
							printableContent: `ポケットサインターネットにお申し込みいただきありがとうございます。申込内容は以下のとおりです。\n\nプラン: ${plan}`,
						},
					},
				},
				{
					// falseを設定した場合は、利用者がこの要求をスキップできるようになります。
					required: false,
					request: {
						// 最新の基本４情報取得についての同意を利用者に要求します。
						case: "personalInfoConsent",
						value: {
							// 基本４情報のうち、提供に同意させるものを指定します。
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
			// セッションの有効期限を指定します。
			expiresAt: Timestamp.fromDate(new Date(Date.now() + 1 * 60 * 60 * 1000)),
			// この値は、セッション中に保持され、Finalize時に同じ値が返されます。
			// ここでは、ランダムかつ再利用不可能な文字列 `nonce` を指定しています。
			metadata: { nonce },
			// スマートフォン上からアプリに遷移したとき、リダイレクトURLを利用せず、手動で元のブラウザに戻ることをユーザーに要求します。
			requireManualReturn: true,
			// `true` を指定すると、コールバック時に署名セッションIDがクエリパラメータ `session_id` として追加されます。
			callbackWithSessionId: false,
		},
		{
			headers: {
				// APIトークンを利用して認証します。
				Authorization: `Bearer ${c.env?.POCKETSIGN_TOKEN}`,
			},
		},
	);

	// ユーザーのブラウザセッションと紐づけて `nonce` を保存します。
	setCookie(c, "nonce", nonce);
	// `callbackWithSessionId` に `false` を指定する場合、`session_id` を保存します。
	setCookie(c, "session_id", resp.id);

	// 利用者を署名を要求する Web ページの URL（リダイレクト URL）に遷移させます。
	return c.redirect(resp.redirectUrl);
});

// Stamp Web サイトからのコールバックリクエストを受け取るエンドポイントです。
app.get("/callback", async c => {
	// `callbackWithSessionId` に `true` を指定した場合、コールバック URL にクエリパラメータ `session_id` が追加されます。
	// const sessionId = c.req.query("session_id");
	// `callbackWithSessionId` に `false` を指定した場合、事前に保存した `session_id` を利用する必要があります。
	const sessionId = getCookie(c, "session_id");

	if (!sessionId) {
		return c.html(<Error message={"セッションIDがありません。"} />);
	}

	try {
		// セッションを終了し、結果を取得します。
		const resp = await client.finalizeSession(
			{
				// 署名セッションIDを指定します。
				id: sessionId,
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

		// APIレスポンスの `results` には、CreateSessionの `requests` で指定した要求に対する結果が含まれます。
		const content = resp.results
			.map(({ result }) => {
				// 公的個人認証サービス(JPKI)より発行された署名用電子証明書による署名の結果を確認します。
				if (result.case === "digitalSignature") {
					// 署名が正常に作成された場合
					if (result.value.response.case === "result") {
						// 署名の検証結果がOKの場合
						if (result.value.response.value.verification?.result === Verification_Result.OK) {
							const content = result.value.response.value.certificateContent?.typeSpecificContent;
							if (content?.case === "jpkiCardDigitalSignatureContent") {
								return `${content.value.commonName} 様、お申し込みありがとうございました。ご自宅（${content.value.address}）に契約書をお送りします。`;
							}
						}
						// 署名の検証に失敗した場合
						else {
							return `本人確認に失敗しました。理由：${
								{
									[Verification_Result.SIGNATURE_MISMATCH]: "署名が一致しませんでした",
									[Verification_Result.CERTIFICATE_REVOKED]: "証明書が失効しています",
									[Verification_Result.CERTIFICATE_EXPIRED]: "証明書が期限切れです",
									[Verification_Result.UNSPECIFIED]: "不明なエラーが発生しました",
								}[result.value.response.value.verification?.result ?? Verification_Result.UNSPECIFIED]
							}。`;
						}
					}
					// 署名が正常に作成されなかった場合
					else {
						return `お申し込みが確認できませんでした。理由：${result.value.response.value?.message}`;
					}
				}
				// 最新の基本４情報取得についての同意を `required: false` としていた場合、同意が得られない可能性があり、その場合 `results` に含まれません。
				if (result.case === "personalInfoConsent") {
					// 同意が得られた場合
					if (result.value.response.case === "result") {
						return `また、最新4情報の提供に同意いただきありがとうございます。同意は ${result.value.response.value.expiresAt
							?.toDate()
							.toLocaleString()} まで有効です。`;
					}
					// 何らかの理由（例：証明書の期限切れ）で同意が確認できなかった場合
					else {
						const info = result.value.response.value?.details
							.filter(it => it.is(ErrorInfo))
							.map(it => ErrorInfo.fromBinary(it.value))[0];
						return `最新4情報の提供の同意が確認できませんでした。理由：${getVerifyErrorMessage(
							info?.reason,
						)}`;
					}
				}
			})
			.join("\n");

		return c.html(<Callback content={content} />);
	} catch (e) {
		if (e instanceof ConnectError) {
			const info = e.findDetails(ErrorInfo)[0];
			return c.html(<Error message={getStampErrorMessage(info?.reason)} />);
		}
		return c.html(<Error message={`不明なエラーが発生しました\n\n${JSON.stringify(e, undefined, 2)}`} />);
	}
});

export default app;

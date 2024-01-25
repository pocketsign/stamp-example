import { ErrorReason as StampErrorReason } from "@buf/pocketsign_apis.bufbuild_es/pocketsign/stamp/v1/types_pb";
import { ErrorReason as VerifyErrorReason } from "@buf/pocketsign_apis.bufbuild_es/pocketsign/verify/v2/types_pb";

type StampErrorReasonKey = `ERROR_REASON_${keyof typeof StampErrorReason}`;

const STAMP_ERROR_MESSAGES: Record<StampErrorReasonKey, string> = {
	ERROR_REASON_UNSPECIFIED: "不明なエラーが発生しました。",
	ERROR_REASON_NO_SUCH_SESSION: "セッションが見つかりませんでした。",
	ERROR_REASON_SESSION_NOT_COMPLETED: "セッションが完了していません。",
	ERROR_REASON_SESSION_ALREADY_COMPLETED: "セッションは既に完了済みです。",
	ERROR_REASON_SESSION_EXPIRED: "セッションが期限切れです。",
	ERROR_REASON_SESSION_CANCELED: "セッションがキャンセルされました。",
};

export const getStampErrorMessage = (reason: string | undefined) => STAMP_ERROR_MESSAGES[reason as StampErrorReasonKey];

type VerifyErrorReasonKey = `ERROR_REASON_${keyof typeof VerifyErrorReason}`;

const VERIFY_ERROR_MESSAGES: Record<VerifyErrorReasonKey, string> = {
	ERROR_REASON_UNSPECIFIED: "不明なエラーが発生しました。",
	ERROR_REASON_INVALID_CERTIFICATE: "証明書の形式が不正です。",
	ERROR_REASON_UNSUPPORTED_CERTIFICATE: "サポートされていない証明書です。",
	ERROR_REASON_OCSP_REQUEST_FAILED: "OCSPによる問い合わせに失敗しました。",
	ERROR_REASON_ASSOCIATED_CERTIFICATE_NOT_EXISTS: "紐付け情報がありません。",
	ERROR_REASON_CONSENT_SERVICE_CERTIFICATE_REVOKED: "証明書が失効しています。",
	ERROR_REASON_CONSENT_SERVICE_CERTIFICATE_EXPIRED: "証明書が有効期限切れです。",
	ERROR_REASON_CONSENT_SERVICE_CERTIFICATE_ON_HOLD: "証明書が一時保留状態です。",
	ERROR_REASON_CONSENT_SERVICE_VERIFICATION_FAILED: "電子署名の検証に失敗しました。",
	ERROR_REASON_CONSENT_SERVICE_NOT_CONSENTED: "同意がありません。",
	ERROR_REASON_CONSENT_SERVICE_CONSENT_EXPIRED: "同意が有効期限切れです。",
	ERROR_REASON_CONSENT_SERVICE_CONSENT_REVOKED: "同意が取り消されています。",
	ERROR_REASON_CONSENT_SERVICE_REQUEST_FAILED: "同意申請リクエストに失敗しました。",
	ERROR_REASON_PERSONAL_INFO_NOT_CONSENTED: "同意がありません。",
	ERROR_REASON_PERSONAL_INFO_CONSENT_EXPIRED: "同意が有効期限切れです。",
	ERROR_REASON_PERSONAL_INFO_CONSENT_REVOKED: "同意が取り消されています。",
	ERROR_REASON_PERSONAL_INFO_LATEST_CERTIFICATE_EXPIRED: "証明書が有効期限切れです。",
	ERROR_REASON_PERSONAL_INFO_LATEST_CERTIFICATE_REVOKED_OR_ON_HOLD: "証明書が失効または一時保留状態です。",
	ERROR_REASON_PERSONAL_INFO_LATEST_CERTIFICATE_UNKNOWN: "証明書の有効性が不明です。",
	ERROR_REASON_PERSONAL_INFO_REQUEST_FAILED: "最新4情報取得リクエストに失敗しました。",
};

export const getVerifyErrorMessage = (reason: string | undefined) =>
	VERIFY_ERROR_MESSAGES[reason as VerifyErrorReasonKey];

use crate::error::{ApiError, ApiResult};
use crate::supabase::SupabaseClient;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, State, Window};
use tauri_plugin_oauth::OauthConfig;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthSession {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub expires_at: i64,
    pub token_type: String,
    pub user: AuthUser,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    pub email_confirmed_at: Option<String>,
    pub phone: Option<String>,
    pub confirmed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub identities: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub session: Option<AuthSession>,
    pub user: Option<AuthUser>,
}

#[derive(Debug, Deserialize)]
struct SupabaseAuthResponse {
    access_token: String,
    refresh_token: String,
    expires_in: i64,
    token_type: String,
    user: AuthUser,
}

// ============================================================================
// Helpers
// ============================================================================

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

// ============================================================================
// OAuth Commands
// ============================================================================

#[tauri::command]
pub async fn auth_oauth_start(
    provider: String,
    window: Window,
    supabase: State<'_, SupabaseClient>,
) -> ApiResult<u16> {
    log::info!("Starting OAuth flow for provider: {}", provider);

    if provider != "google" {
        return Err(ApiError::AuthError(format!(
            "Unsupported OAuth provider: {}",
            provider
        )));
    }

    let config = OauthConfig {
        ports: Some(vec![9000, 9003, 9009]),
        response: Some(concat!(
            "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"/>",
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>",
            "<title>TheAtlas YouTube - Authenticated</title>",
            "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
            "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
            "<link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap\" rel=\"stylesheet\">",
            "<style>",
            "*{margin:0;padding:0;box-sizing:border-box;}",
            "body{font-family:'Inter',system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#fdf8f5;color:#1c1b1a;}",
            ".container{max-width:480px;width:100%;}.card{background:#ffffff;border-radius:20px;padding:48px 32px;text-align:center;box-shadow:0 20px 60px rgba(59,54,40,0.12);border:1px solid #ccc6bb;}",
            ".logo{display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:#3b3628;color:#ffffff;font-size:24px;font-weight:700;margin-bottom:16px;}",
            "h1{font-size:24px;font-weight:700;margin-bottom:24px;color:#3b3628;}h2{font-size:20px;font-weight:600;margin-bottom:12px;}",
            ".icon{width:64px;height:64px;margin:0 auto 24px;position:relative;}",
            ".success-icon svg{color:#4b882e;animation:bounce .6s ease-in-out;}",
            ".success-ping{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:80px;height:80px;background:#4b882e;border-radius:50%;opacity:.2;animation:ping 1s cubic-bezier(0,0,.2,1) infinite;}",
            ".subtitle{font-size:14px;color:#7b776d;line-height:1.5;}",
            ".redirect-msg{margin-top:24px;padding:16px;border-radius:12px;border:1px solid #ccc6bb;background:#f7f3f0;font-size:14px;font-weight:500;}",
            ".countdown{color:#3b3628;font-weight:700;font-size:16px;}",
            ".footer{margin-top:32px;padding-top:24px;border-top:1px solid #ccc6bb;}",
            ".footer-text{font-size:12px;color:#7b776d;}.footer-subtext{font-size:11px;color:#9c9890;margin-top:4px;}",
            "@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}",
            "@keyframes ping{75%,100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}}",
            "</style></head><body><div class=\"container\"><div class=\"card\">",
            "<div class=\"logo\">TA</div><h1>TheAtlas YouTube</h1>",
            "<div class=\"icon success-icon\"><div class=\"success-ping\"></div>",
            "<svg width=\"64\" height=\"64\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">",
            "<path d=\"M22 11.08V12a10 10 0 1 1-5.93-9.14\"/><polyline points=\"22 4 12 14.01 9 11.01\"/></svg></div>",
            "<h2>Authentication Successful! &#10024;</h2>",
            "<p class=\"subtitle\">You have been successfully signed in.</p>",
            "<div class=\"redirect-msg\" id=\"msg\">Redirecting you to <strong>TheAtlas YouTube</strong> in <span class=\"countdown\" id=\"cd\">3</span> seconds...</div>",
            "<div class=\"footer\"><p class=\"footer-text\">TheAtlas YouTube Agent</p>",
            "<p class=\"footer-subtext\">Secure authentication powered by OAuth 2.0</p></div>",
            "</div></div>",
            "<script>var s=3,el=document.getElementById('msg'),cd=document.getElementById('cd');",
            "var t=setInterval(function(){s--;if(s<=0){clearInterval(t);",
            "el.innerHTML='&#9989; You can safely close this tab and return to <strong>TheAtlas YouTube</strong>.';}",
            "else{cd.textContent=s;}},1000);</script>",
            "</body></html>"
        ).into()),
    };

    let port = tauri_plugin_oauth::start_with_config(config, move |url| {
        log::info!("OAuth callback received: {}", url);
        if let Err(e) = window.emit("oauth-callback", url) {
            log::error!("Failed to emit oauth-callback event: {}", e);
        }
    })
    .map_err(|e| {
        log::error!("Failed to start OAuth server: {}", e);
        ApiError::AuthError(format!("Failed to start OAuth server: {}", e))
    })?;

    log::info!("OAuth server started on port: {}", port);

    let redirect_uri = format!("http://localhost:{}", port);
    let oauth_url = format!(
        "{}authorize?provider={}&redirect_to={}",
        supabase.auth_url(""),
        provider,
        urlencoding::encode(&redirect_uri)
    );

    if let Err(e) = open::that(&oauth_url) {
        log::error!("Failed to open browser: {}", e);
        return Err(ApiError::AuthError(format!("Failed to open browser: {}", e)));
    }

    Ok(port)
}

#[tauri::command]
pub fn auth_oauth_cancel(port: u16) -> ApiResult<()> {
    log::info!("Cancelling OAuth flow on port: {}", port);
    tauri_plugin_oauth::cancel(port).map_err(|e| {
        log::error!("Failed to cancel OAuth server: {}", e);
        ApiError::AuthError(format!("Failed to cancel OAuth server: {}", e))
    })?;
    Ok(())
}

#[tauri::command]
pub async fn auth_parse_oauth_callback(
    url: String,
    supabase: State<'_, SupabaseClient>,
) -> ApiResult<AuthResponse> {
    log::info!("Parsing OAuth callback URL");

    let parsed_url = url::Url::parse(&url).map_err(|e| {
        ApiError::AuthError(format!("Invalid callback URL: {}", e))
    })?;

    let params: std::collections::HashMap<String, String> =
        if let Some(fragment) = parsed_url.fragment() {
            url::form_urlencoded::parse(fragment.as_bytes())
                .into_owned()
                .collect()
        } else {
            parsed_url.query_pairs().into_owned().collect()
        };

    if let Some(error) = params.get("error") {
        let desc = params
            .get("error_description")
            .map(|s| s.as_str())
            .unwrap_or("OAuth authentication failed");
        log::error!("OAuth error: {} - {}", error, desc);
        return Err(ApiError::AuthError(desc.to_string()));
    }

    let access_token = params.get("access_token").ok_or_else(|| {
        ApiError::AuthError("No access token received".to_string())
    })?;

    let refresh_token = params.get("refresh_token").ok_or_else(|| {
        ApiError::AuthError("No refresh token received".to_string())
    })?;

    let expires_in = params
        .get("expires_in")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(3600);

    let token_type = params
        .get("token_type")
        .cloned()
        .unwrap_or_else(|| "bearer".to_string());

    // Get user info
    let user_url = supabase.auth_url("user");
    let headers = supabase.get_authenticated_headers(access_token);

    let response = supabase
        .client()
        .get(&user_url)
        .headers(headers)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        log::error!("Failed to get user info: {}", error_text);
        return Err(ApiError::AuthError(
            "Failed to retrieve user information".to_string(),
        ));
    }

    let user: AuthUser = response.json().await?;
    log::info!("User info retrieved for: {}", user.email);

    let now = current_timestamp();
    let session = AuthSession {
        access_token: access_token.clone(),
        refresh_token: refresh_token.clone(),
        expires_in,
        expires_at: now + expires_in,
        token_type,
        user: user.clone(),
    };

    Ok(AuthResponse {
        session: Some(session),
        user: Some(user),
    })
}

// ============================================================================
// Session Management
// ============================================================================

#[tauri::command]
pub async fn auth_sign_out(
    access_token: String,
    supabase: State<'_, SupabaseClient>,
) -> ApiResult<()> {
    log::info!("Sign out request");

    let url = supabase.auth_url("logout");
    let _ = supabase
        .client()
        .post(&url)
        .headers(supabase.get_authenticated_headers(&access_token))
        .send()
        .await;

    log::info!("Sign out successful");
    Ok(())
}

#[tauri::command]
pub async fn auth_get_session(
    access_token: String,
    supabase: State<'_, SupabaseClient>,
) -> ApiResult<AuthResponse> {
    let url = supabase.auth_url("user");

    let response = supabase
        .client()
        .get(&url)
        .headers(supabase.get_authenticated_headers(&access_token))
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(ApiError::AuthError("Session expired or invalid".to_string()));
    }

    let user: AuthUser = response.json().await?;

    Ok(AuthResponse {
        session: None,
        user: Some(user),
    })
}

#[tauri::command]
pub async fn auth_refresh_token(
    refresh_token: String,
    supabase: State<'_, SupabaseClient>,
) -> ApiResult<AuthResponse> {
    log::info!("Refreshing access token");

    let url = supabase.auth_url("token?grant_type=refresh_token");
    let body = serde_json::json!({ "refresh_token": refresh_token });

    let response = supabase
        .client()
        .post(&url)
        .headers(supabase.get_headers())
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        log::error!("Token refresh failed: {}", error_text);
        return Err(ApiError::AuthError(
            "Session expired. Please sign in again.".to_string(),
        ));
    }

    let auth_data: SupabaseAuthResponse = response.json().await?;
    let now = current_timestamp();

    let session = AuthSession {
        access_token: auth_data.access_token,
        refresh_token: auth_data.refresh_token,
        expires_in: auth_data.expires_in,
        expires_at: now + auth_data.expires_in,
        token_type: auth_data.token_type,
        user: auth_data.user.clone(),
    };

    Ok(AuthResponse {
        session: Some(session),
        user: Some(auth_data.user),
    })
}

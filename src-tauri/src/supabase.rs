use reqwest::{
    header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE},
    Client, ClientBuilder,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;

pub struct SupabaseClient {
    client: Arc<Client>,
    base_url: String,
    anon_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SupabaseError {
    pub message: String,
    pub code: Option<String>,
}

impl SupabaseClient {
    pub fn new() -> Self {
        dotenv::dotenv().ok();

        let base_url = "https://zxxaiivewfraanfnumpp.supabase.co".to_string();
        let anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4eGFpaXZld2ZyYWFuZm51bXBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyOTEzNTcsImV4cCI6MjA3ODg2NzM1N30.AnG-orkyW7OLjyBlZ8TQBlIriBvrLv2HGXVh-LjG5xU".to_string();

        log::info!("Initializing Supabase client for: {}", base_url);

        let client = ClientBuilder::new()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(Duration::from_secs(90))
            .user_agent("TheAtlas-YouTube/1.0")
            .https_only(true)
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client: Arc::new(client),
            base_url: base_url.trim_end_matches('/').to_string(),
            anon_key,
        }
    }

    pub fn get_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            "apikey",
            HeaderValue::from_str(&self.anon_key).expect("Invalid API key format"),
        );
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", self.anon_key))
                .expect("Invalid authorization header"),
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(
            "X-Client-Info",
            HeaderValue::from_static("theatlas-youtube/1.0"),
        );
        headers
    }

    pub fn get_authenticated_headers(&self, access_token: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            "apikey",
            HeaderValue::from_str(&self.anon_key).expect("Invalid API key format"),
        );
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", access_token))
                .expect("Invalid authorization header"),
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(
            "X-Client-Info",
            HeaderValue::from_static("theatlas-youtube/1.0"),
        );
        headers
    }

    pub fn auth_url(&self, endpoint: &str) -> String {
        let sanitized_endpoint = endpoint.trim_start_matches('/');
        format!("{}/auth/v1/{}", self.base_url, sanitized_endpoint)
    }

    pub fn client(&self) -> &Client {
        &self.client
    }
}

impl Default for SupabaseClient {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for SupabaseClient {
    fn clone(&self) -> Self {
        Self {
            client: Arc::clone(&self.client),
            base_url: self.base_url.clone(),
            anon_key: self.anon_key.clone(),
        }
    }
}

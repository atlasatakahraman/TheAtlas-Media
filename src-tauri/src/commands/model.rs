#[allow(dead_code)]
pub struct Queue {
    pub first: i32,
    pub last: i32,
    pub current: i32,
    pub list: Vec<Video>,
}

#[allow(dead_code)]
pub struct Video {
    pub url: String,
    pub valid: bool,
    pub fps: i32,
    pub duration: i64,
}

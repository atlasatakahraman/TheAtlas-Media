pub struct Queue {
    first: i32,
    last: i32,
    current: i32,
    list: Vec<Video>,
}

pub struct Video {
    url: String,
    valid: bool,
    fps: i32,
    duration: i64,
}

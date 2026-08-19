//! The managed-binary subsystem: what the tools are, where they are, how they
//! get here, and whether to believe what arrived.

pub mod download;
pub mod extract;
pub mod freshness;
pub mod install;
pub mod probe;
pub mod registry;
pub mod types;
pub mod verify;

FROM rust:1.93-slim
RUN cargo install wasm-pack
WORKDIR /build
COPY Cargo.toml ./
COPY src/ src/
CMD ["wasm-pack", "build", "--target", "nodejs", "--release", "--out-dir", "/output/pkg"]

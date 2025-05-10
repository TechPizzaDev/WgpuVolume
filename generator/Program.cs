using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Runtime.Intrinsics;
using System.Text;
using SharpFastNoise2;
using SharpFastNoise2.Functions;
using SharpFastNoise2.Generators;
using ShellProgressBar;

class Program
{
    static void Main(string[] args)
    {
        string path = Path.GetFullPath("noise.bin.gz");

        int seed = 1234;
        int width = 256;
        int height = 256;
        int depth = 256;
        int levels = 4;

        using ProgressBar pBar = new(levels, $"Generating \"{path}\" ", new ProgressBarOptions()
        {
            CollapseWhenFinished = true,
        });

        FileStream fs = new(path, FileMode.Create);
        using Stream stream = path.EndsWith(".gz") ? new GZipStream(fs, CompressionLevel.Optimal, false) : fs;

        byte[] buffer = new byte[width * height * depth];

        for (int l = 0; l < levels; l++)
        {
            int mipWidth = width >> l;
            int mipHeight = height >> l;
            int mipDepth = depth >> l;

            using var levelBar = pBar.Spawn(depth, $"{depth} levels");
            if (true)
            {
                Test<Vector128<float>, Vector128<int>, Sse2Functions,
                    Perlin<Vector128<float>, Vector128<int>, Sse2Functions>>(
                        levelBar, stream, buffer, seed, mipWidth, mipHeight, mipDepth, new());
            }
            else
            {
                using BinaryWriter writer = new(stream, Encoding.UTF8, true);

                int srcOffset = 0;
                int dstOffset = 0;

                byte[] mipBuffer = new byte[mipWidth * mipHeight * mipDepth];

                // TODO: this resizing is broken 

                for (int z = 0; z < mipDepth; z++)
                {
                    for (int y = 0; y < mipHeight; y++)
                    {
                        Span<byte> srcRow = buffer.AsSpan(srcOffset, mipWidth << 1);
                        Span<byte> dstRow = mipBuffer.AsSpan(dstOffset, mipWidth);

                        for (int x = 0; x < mipWidth; x++)
                        {
                            //dstRow[x] = Math.Max(srcRow[x * 2], srcRow[x * 2 + 1]);
                            dstRow[x] = (byte)((srcRow[x * 2] + srcRow[x * 2 + 1]) / 2);
                        }

                        writer.Write(dstRow);

                        srcOffset += mipWidth << 1;
                        dstOffset += mipWidth;
                    }
                }

                buffer = mipBuffer;
            }
            pBar.Tick();
        }

        Console.Write(path);
    }

    enum TileType : int
    {
        Water,
        Grass,
        Dirt,
        Sand,
        Stone,
        Snow,
        Air = byte.MaxValue,
    }

    static void Test<f32, i32, F, G>(
        ProgressBarBase pBar, Stream stream, byte[]? fullBuffer,
        int seed, int width, int height, int depth, G generator)
        where F : IFunctionList<f32, i32, F>
        where G : INoiseGenerator3D<f32, i32>
    {
        Stopwatch w = new();
        w.Restart();

        float scale = width / 12f;

        var vSeed = F.Broad(seed);
        var vIncX = F.Add(F.Incremented_f32(), F.Broad(0f));
        var sIncX = F.Div(vIncX, F.Broad(scale));

        var buffer32 = new int[Math.Max(G.UnitSize, width)];
        var buffer8 = new byte[buffer32.Length];

        using BinaryWriter writer = new(stream, Encoding.UTF8, true);
        int fullOffset = 0;

        f32 sHeight = F.Broad(height / scale);

        static i32 Broad(TileType type) => F.Broad((int)type);

        for (int z = 0; z < depth; z++)
        {
            f32 sZ = F.Broad(z / scale);
            f32 vZ = F.Broad((float)z);

            for (int y = 0; y < height; y++)
            {
                f32 sY = F.Broad(y / scale);
                f32 vY = F.Broad((float)y);
                f32 pY = F.Broad((float)y / height);

                for (int x = 0; x < width; x += G.UnitSize)
                {
                    f32 sX = F.Add(F.Broad(x / scale), sIncX);

                    f32 vX = F.Add(F.Broad((float)x), vIncX);

                    const int N_OCTAVES = 4;
                    f32 noise = F.Broad(0f);

                    f32 amplitude = F.Broad(0.6f);
                    f32 frequency = F.Broad(0.3f / scale);
                    for (int i = 0; i < N_OCTAVES; i++)
                    {
                        f32 gen = generator.Gen(
                            F.Mul(frequency, vX),
                            F.Mul(frequency, vY),
                            F.Mul(frequency, vZ),
                            vSeed
                        );
                        f32 scaled = F.Mul(F.Add(gen, F.Broad(1f)), F.Broad(0.5f));
                        noise = F.Add(noise, F.Mul(scaled, amplitude));

                        amplitude = F.Mul(amplitude, F.Broad(0.5f));
                        frequency = F.Mul(frequency, F.Broad(2.0f));
                    }

                    f32 fallStart = F.Add(pY, F.Broad(1.25f));
                    f32 falloff = F.Mul(F.Broad(0.3f), F.Mul(fallStart, fallStart));
                    noise = F.Mul(noise, falloff);
                    
                    float carveThreshold = 0.5f;
                    float dirtThreshold = carveThreshold - 0.1f;
                    float grassThreshold = carveThreshold - 0.025f;
                    float sandThreshold = carveThreshold - 0.04f;

                    f32 isAboveWater = F.GreaterThan(sY, F.Mul(sHeight, F.Broad(0.5f)));

                    f32 isDirt = F.And(F.GreaterThan(noise, F.Broad(dirtThreshold)), isAboveWater);
                    f32 isSand = F.GreaterThan(noise, F.Broad(sandThreshold));
                    i32 tileSolid = F.Select(
                        F.Cast_i32(isDirt),
                        Broad(TileType.Dirt),
                        F.Select(F.Cast_i32(isSand), Broad(TileType.Sand), Broad(TileType.Stone)));

                    f32 isCarved = F.LessThan(noise, F.Broad(carveThreshold));
                    i32 tileCarved = F.Select(F.Cast_i32(isCarved), tileSolid, Broad(TileType.Air));

                    i32 isAir = F.Equal(tileCarved, Broad(TileType.Air));
                    i32 isWater = F.AndNot(isAir, F.Cast_i32(isAboveWater));
                    i32 tileWet = F.Select(isWater, Broad(TileType.Water), tileCarved);

                    i32 canCover = F.Equal(tileWet, Broad(TileType.Dirt));
                    f32 shouldCover = F.GreaterThanOrEqual(noise, F.Broad(grassThreshold));
                    i32 isCovered = F.And(canCover, F.Cast_i32(shouldCover));
                    i32 tileCover = F.Select(isCovered, Broad(TileType.Grass), tileWet);

                    // i32 conv = F.Convert_i32(F.Mul(scaled, F.Broad((float)(byte.MaxValue / 2.0))));
                    F.Store(buffer32.AsSpan(x), tileCover);
                }

                Narrow(buffer32, buffer8);
                writer.Write(buffer8.AsSpan(0, width));

                if (fullBuffer != null)
                {
                    buffer8.AsSpan(0, width).CopyTo(fullBuffer.AsSpan(fullOffset, width));
                    fullOffset += width;
                }
            }

            pBar.Tick();
        }

        w.Stop();

        //pBar.Tick($"({w.Elapsed.TotalMilliseconds,4:0.0}ms)");
    }

    private static void Narrow(ReadOnlySpan<int> src, Span<byte> dst)
    {
        while (src.Length >= Vector128<byte>.Count)
        {
            var a32 = Vector128.Create(src);
            var b32 = Vector128.Create(src.Slice(4));
            var c32 = Vector128.Create(src.Slice(8));
            var d32 = Vector128.Create(src.Slice(12));

            var a16 = Vector128.Narrow(a32, b32);
            var b16 = Vector128.Narrow(c32, d32);

            Vector128.Narrow(a16, b16).AsByte().CopyTo(dst);

            src = src.Slice(16);
            dst = dst.Slice(16);
        }

        for (int i = 0; i < src.Length; i++)
        {
            dst[i] = (byte)src[i];
        }
    }
}

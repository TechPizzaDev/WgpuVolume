using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.CompilerServices;
using System.Runtime.Intrinsics;
using SharpFastNoise2;
using SharpFastNoise2.Distance;
using SharpFastNoise2.Functions;
using SharpFastNoise2.Generators;
using ShellProgressBar;

class Program
{
    static void Main(string[] args)
    {
        Test<Vector128<float>, Vector128<int>, Sse2Functions,
            Perlin<Vector128<float>, Vector128<int>, Sse2Functions>>("noise.bin", 1234, 180, 216, 180, new());
    }

    static void Test<f32, i32, F, G>(string path, int seed, int width, int height, int depth, G generator)
        where F : IFunctionList<f32, i32, F>
        where G : INoiseGenerator3D<f32, i32>
    {
        using ProgressBar pBar = new(depth, $"Generating \"{path}\" ", new ProgressBarOptions()
        {
            CollapseWhenFinished = true,
        });

        Stopwatch w = new();
        w.Restart();

        var vSeed = F.Broad(seed);
        var vIncX = F.Div(F.Add(F.Incremented_f32(), F.Broad(0f)), F.Broad(32f));

        var buffer32 = new int[width];
        var buffer8 = new byte[width];
        using var writer = new BinaryWriter(new FileStream(path, FileMode.Create));

        for (int z = 0; z < depth; z++)
        {
            f32 vz = F.Broad(z / 32f);

            for (int y = 0; y < height; y++)
            {
                f32 vy = F.Broad(y / 32f);

                for (int x = 0; x < width; x += G.UnitSize)
                {
                    f32 vx = F.Add(F.Broad(x / 32f), vIncX);

                    f32 noise = generator.Gen(vx, vy, vz, vSeed);

                    f32 scaled = F.Mul(F.Add(noise, F.Broad(1f)), F.Broad((float) (byte.MaxValue / 2.0)));
                    i32 conv = F.Convert_i32(scaled);
                    F.Store(buffer32.AsSpan(x), conv);
                }

                Narrow(buffer32, buffer8);
                writer.Write(buffer8);
            }

            pBar.Tick();
        }

        w.Stop();

        pBar.Tick($"({w.Elapsed.TotalMilliseconds,4:0.0}ms)");
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
            dst[i] = (byte) src[i]; 
        }
    }
}

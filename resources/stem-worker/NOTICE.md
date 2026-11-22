# 第三方组件说明

本目录包含 Demucs v4 推理代码和 Julius 重采样代码，二者均以 MIT 许可发布。
完整许可文本见同目录 `LICENSE-DEMUCS` 与 `LICENSE-JULIUS`。

模型权重 `htdemucs.th` 不随本应用重新分发，由用户在 CineLab 组件页触发下载，
来源为 Meta 官方地址或 Hugging Face 上的公开镜像。模型权重来自
[CineLab](https://github.com/LAUFLO/CineLab) 之外，使用前请自行确认适用许可。

Demucs 引用：

```bibtex
@inproceedings{rouard2023hybrid,
  title     = {Hybrid Transformers for Music Source Separation},
  author    = {Rouard, Simon and Massa, Francisco and D{\'e}fossez, Alexandre},
  booktitle = {ICASSP},
  year      = {2023}
}
```

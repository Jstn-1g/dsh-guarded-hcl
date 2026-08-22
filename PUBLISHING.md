# Publishing Checklist

## Fastest route from a PC

1. Create a new **public** GitHub repository named `dsh-guarded-hcl` under `Jstn-1g`.
2. Do not initialize it with a README, license, or `.gitignore`; those files are already included.
3. Extract the provided ZIP.
4. Open a terminal in the extracted folder and run:

```bash
git init
git add .
git commit -m "Initial guarded HCL contract and retention gate"
git branch -M main
git remote add origin https://github.com/Jstn-1g/dsh-guarded-hcl.git
git push -u origin main
```

5. Add repository topics: `deepseek-harness`, `continual-learning`, `agent-evaluation`, and `harness`. Add `dsh-plugin` after the Cordis adapter is implemented.
6. Copy the comment from `docs/github-discussion-comment.md`, add the new repository URL, and post it in DeepSeek Harness Discussion #2454.

## Phone-only route

Posting the Discussion comment is easy from the GitHub app or mobile browser. Publishing the complete multi-file repository from a phone is possible but cumbersome. The practical approach is to post the comment first without the final repository paragraph, then publish the repository from a PC and edit the comment to add the link.

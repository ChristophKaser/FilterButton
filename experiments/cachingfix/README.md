# CachingFix

This WebExtension Experiment helps with cache-related cleanup tasks when
disabling, uninstalling or updating the add-on.

## Usage

Copy the experiment into your add-on and add it to your manifest.json:
```
{
  "experiment_apis": {
    "ex_cachingfix": {
      "schema": "experiments/cachingfix/api.json",
      "parent": {
        "scopes": ["addon_parent"],
        "paths": [["ex_cachingfix"]],
        "script": "experiments/cachingfix/parent.js",
        "events": ["startup"]
      }
    }
  }
}
```

After adding the experiment, you no longer need to unload JSMs loaded from
the WebExtension's rootURI (file://- or jar://-URLs) or invalidate the
startup cache by hand. You do not need to invoke the API in any way, the
experiment is activated automatically.
